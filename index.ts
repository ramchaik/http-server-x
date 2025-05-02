import * as net from "net";

function newConnection(socket: net.Socket) {
    console.log('new conenction', socket.remoteAddress, socket.remotePort)

    socket.on('end', () => {
        // FIN received. The connection will be automatically closed.
        console.log('end');
    });
    socket.on('data', (data: Buffer) => {
        console.log('data: ', data); 
        socket.write(data); // echo back the data
        
        if (data.includes('q')) {
            console.log('closing.');
            socket.end(); // send FIN and close the connection.
        }
    });
}

let server = net.createServer({});
server.on('connection', newConnection);
server.on('error', (err) => {
    throw err;
});
server.listen({host: "127.0.0.1", port: 1234});
