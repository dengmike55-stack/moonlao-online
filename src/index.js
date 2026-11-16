export class MoonlaoRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.players = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/room") {
      return new Response("Not Found", { status: 404 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    const id = crypto.randomUUID();
    const player = {
      id,
      x: 0,
      y: 0,
      z: 0,
      rotation: 0
    };

    this.players.set(id, player);
    server.serializeAttachment({ id });

    server.send(JSON.stringify({
      type: "welcome",
      id,
      players: [...this.players.values()]
    }));

    this.broadcast({
      type: "player_joined",
      player
    }, server);

    server.addEventListener("message", event => {
      try {
        const data = JSON.parse(event.data);
        const current = this.players.get(id);
        if (!current) return;

        if (data.type === "move") {
          for (const field of ["x", "y", "z", "rotation"]) {
            if (typeof data[field] === "number" &&
                Number.isFinite(data[field])) {
              current[field] = data[field];
            }
          }

          this.broadcast({
            type: "player_moved",
            player: current
          }, server);
        }
      } catch {
        server.send(JSON.stringify({
          type: "error",
          message: "Invalid message"
        }));
      }
    });

    const remove = () => this.removePlayer(id);
    server.addEventListener("close", remove);
    server.addEventListener("error", remove);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  broadcast(message, except = null) {
    const payload = JSON.stringify(message);

    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== except) {
        try {
          socket.send(payload);
        } catch {}
      }
    }
  }

  removePlayer(id) {
    if (!this.players.has(id)) return;

    this.players.delete(id);

    this.broadcast({
      type: "player_left",
      id
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/room") {
      const room = env.MOONLAO_ROOM.get(
        env.MOONLAO_ROOM.idFromName("main-hall")
      );
      return room.fetch(request);
    }

    return new Response("Moonlao Online Server is running.");
  }
};
