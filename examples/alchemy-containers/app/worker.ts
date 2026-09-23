import { DurableObject } from "cloudflare:workers";
export class ProbeContainer extends DurableObject {
  async fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname === "/destroy") {
      await this.ctx.container!.destroy();
      return new Response("destroyed");
    }
    if (!this.ctx.container!.running)
      this.ctx.container!.start({
        enableInternet: url.searchParams.get("internet") !== "off",
      });
    let last;
    for (let n = 0; n < 80; n++) {
      try {
        return await this.ctx.container!.getTcpPort(8080).fetch(req.clone());
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    return new Response(String(last), { status: 502 });
  }
}
export default {
  async fetch(req: Request, env: any) {
    const url = new URL(req.url);
    if (url.pathname === "/worker") return new Response("worker-ready");
    const name =
      url.searchParams.get("internet") === "off" ? "offline" : "online";
    return env.CONTAINER.get(env.CONTAINER.idFromName(name)).fetch(req);
  },
};
