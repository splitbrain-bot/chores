import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';

/** A command message of the client. */
export interface Command {
    id: number;
    type: string;
    [key: string]: unknown;
}

/** Handler for commands that need an answer from the test. */
export type CommandHandler = (cmd: Command) => unknown;

/**
 * A fake Home Assistant server with the WebSocket API and the history endpoint. It implements only text frames,
 * close frames and pings of RFC 6455.
 */
export class FakeHa {
    private server: Server;
    private sockets = new Set<Duplex>();
    readonly commands: Command[] = [];
    handlers = new Map<string, CommandHandler>();
    history: unknown = [];
    historyRequests: URL[] = [];
    token = 'secret';

    constructor() {
        this.server = createServer((req, res) => {
            const url = new URL(req.url ?? '/', 'http://localhost');
            if (url.pathname.startsWith('/api/history/period/')) {
                this.historyRequests.push(url);
                if (req.headers.authorization !== `Bearer ${this.token}`) {
                    res.writeHead(401).end();
                    return;
                }
                res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(this.history));
                return;
            }
            res.writeHead(404).end();
        });
        this.server.on('upgrade', (req, socket) => this.upgrade(req, socket));
    }

    /** Starts the server on a free port and returns the base URL. */
    async listen(): Promise<string> {
        await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
        return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    }

    /** Stops the server. */
    async close(): Promise<void> {
        this.dropConnections();
        await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }

    /** Closes all WebSocket connections, so that the client reconnects. */
    dropConnections(): void {
        for (const s of this.sockets) s.destroy();
        this.sockets.clear();
    }

    /**
     * Sends an event to all connections.
     *
     * @param id the subscription id
     * @param event the event payload
     */
    push(id: number, event: unknown): void {
        this.broadcast({ id, type: 'event', event });
    }

    /**
     * Returns the latest command of a type.
     *
     * @param type the command type
     */
    last(type: string): Command | undefined {
        return this.commands.filter((c) => c.type === type).at(-1);
    }

    /**
     * Waits until a command of a type arrives.
     *
     * @param type the command type
     * @param count the number of commands of the type to wait for
     */
    async waitFor(type: string, count = 1): Promise<Command> {
        for (let i = 0; i < 200; i++) {
            const list = this.commands.filter((c) => c.type === type);
            if (list.length >= count) return list[count - 1]!;
            await new Promise((r) => setTimeout(r, 10));
        }
        throw new Error(`No ${type} command`);
    }

    /**
     * Completes the WebSocket handshake.
     *
     * @param req the upgrade request
     * @param socket the socket
     */
    private upgrade(req: IncomingMessage, socket: Duplex): void {
        const key = req.headers['sec-websocket-key'];
        const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
        socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
        this.sockets.add(socket);
        socket.on('close', () => this.sockets.delete(socket));
        socket.on('error', () => this.sockets.delete(socket));

        let buffer = Buffer.alloc(0);
        socket.on('data', (chunk: Buffer) => {
            buffer = Buffer.concat([buffer, chunk]);
            for (;;) {
                const frame = readFrame(buffer);
                if (!frame) break;
                buffer = buffer.subarray(frame.length);
                if (frame.opcode === 8) socket.end();
                else if (frame.opcode === 1) this.handle(socket, JSON.parse(frame.payload.toString('utf8')));
            }
        });
        send(socket, { type: 'auth_required', ha_version: '2026.10.2' });
    }

    /**
     * Answers one client message.
     *
     * @param socket the socket
     * @param msg the message
     */
    private handle(socket: Duplex, msg: Command): void {
        if (msg.type === 'auth') {
            if (msg.access_token === this.token) send(socket, { type: 'auth_ok', ha_version: '2026.10.2' });
            else send(socket, { type: 'auth_invalid', message: 'Invalid access token' });
            return;
        }
        this.commands.push(msg);
        const handler = this.handlers.get(msg.type);
        let result: unknown = null;
        try {
            if (handler) result = handler(msg);
        } catch (err) {
            send(socket, { id: msg.id, type: 'result', success: false, error: { code: 'error', message: String(err) } });
            return;
        }
        send(socket, { id: msg.id, type: 'result', success: true, result: result ?? null });
    }

    /**
     * Sends a message to all connections.
     *
     * @param msg the message
     */
    private broadcast(msg: unknown): void {
        for (const s of this.sockets) send(s, msg);
    }
}

/**
 * Sends a JSON text frame.
 *
 * @param socket the socket
 * @param msg the message
 */
function send(socket: Duplex, msg: unknown): void {
    const payload = Buffer.from(JSON.stringify(msg), 'utf8');
    let header: Buffer;
    if (payload.length < 126) {
        header = Buffer.from([0x81, payload.length]);
    } else if (payload.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(payload.length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    socket.write(Buffer.concat([header, payload]));
}

/**
 * Reads one masked client frame from a buffer.
 *
 * @param buf the received bytes
 * @returns the frame and its length in bytes, or null when the frame is incomplete
 */
function readFrame(buf: Buffer): { opcode: number; payload: Buffer; length: number } | null {
    if (buf.length < 2) return null;
    const opcode = buf[0]! & 0x0f;
    let len = buf[1]! & 0x7f;
    let offset = 2;
    if (len === 126) {
        if (buf.length < 4) return null;
        len = buf.readUInt16BE(2);
        offset = 4;
    } else if (len === 127) {
        if (buf.length < 10) return null;
        len = Number(buf.readBigUInt64BE(2));
        offset = 10;
    }
    if (buf.length < offset + 4 + len) return null;
    const mask = buf.subarray(offset, offset + 4);
    const payload = Buffer.from(buf.subarray(offset + 4, offset + 4 + len));
    for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ mask[i % 4]!;
    return { opcode, payload, length: offset + 4 + len };
}
