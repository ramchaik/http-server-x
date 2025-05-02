import * as net from "net";

type TCPConn = {
    socket: net.Socket; // js socker object
    err: null|Error; // from 'error' event
    ended: boolean; // EOF, from 'end' event
    reader: null|{ // callbacks of the promise of the current read
        resolve: (value: Buffer) => void;
        reject: (err: Error) => void;
    };
};

function soInit(socket: net.Socket): TCPConn {
    const conn: TCPConn = {
        socket: socket,
        err: null,
        ended: false,
        reader: null,
    };
    socket.on('data', (data: Buffer) => {
        console.assert(conn.reader, "Reader callbacks not attached on the tcp connection");
        // pause 'data' event until next read
        socket.pause();
        // fulfill promise of the current read
        conn.reader?.resolve(data);
        conn.reader = null;
    });
    socket.on('end', () => {
        conn.ended = true;
        if (conn.reader) {
            conn.reader.resolve(Buffer.from("")); // EOF
            conn.reader = null;
        }
    });
    socket.on('error', (err: Error) => {
        conn.err = err;
        if (conn.reader) {
            conn.reader.reject(err);
            conn.reader = null;
        }
    })
    return conn;
}

// returns an empty buffer after EOF.
function soRead(conn: TCPConn): Promise<Buffer> {
    console.assert(!conn.reader, "Callbacks for the reader already registered!"); // no concurrent calls
    return new Promise((resolve, reject) => {
        // if connection is not readable, complete the promise now
        if (conn.err) {
            reject(conn.err);
        }
        if (conn.ended) {
            resolve(Buffer.from("")); // EOF
        }


        // save promise callbacks
        conn.reader = {
            resolve: resolve,
            reject: reject,
        };
        // and resume 'data' event to fulfill promise later
        conn.socket.resume();
    });
}

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
    console.assert(data.length > 0);
    return new Promise((resolve, reject) => {
        if (conn.err) {
            reject(conn.err);
            return;
        }

        conn.socket.write(data, (err?: Error) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function newConn(conn: TCPConn): Promise<void> {
    console.log('new connection', conn.socket.remoteAddress, conn.socket.remotePort);
    try {
        await serveClient(conn);
    } catch (exc) {
        console.error("error: ", exc);
    } finally {
        conn.socket.destroy();
    }
}

// echo server
async function serveClient(conn: TCPConn): Promise<void> {
    while (true) {
        const data = await soRead(conn);
        if (data.length === 0) {
            console.log('end connection');
            break;
        }

        console.log('data', data);
        await soWrite(conn, data); // echo back
    }
}

type TCPListener = {
    server: net.Server;
};

function soListen(host: string, port: number): TCPListener {
    const server = net.createServer({
        pauseOnConnect: true,
    });
    server.listen({
        host: host,
        port: port,
    });
    return {
        server
    };
}

async function soAccept(listener: TCPListener): Promise<TCPConn> {
    return new Promise((resolve, reject) => {
        listener.server.once('connection', (socket: net.Socket) => {
            const conn = soInit(socket);
            resolve(conn);
        });
        listener.server.once('error', (err: Error) => {
            reject(err);
        });
    });
}

async function serverLoop(host: string, port: number) {
    const listener = soListen(host, port);
    while (true) {
        try {
            const conn = await soAccept(listener);
            newConn(conn); // fire and forget
        } catch (exc) {
            console.error('server exception', exc)
            break;
        }
    }
    listener.server.close();
}

serverLoop("127.0.0.1", 1234).catch(console.error);
