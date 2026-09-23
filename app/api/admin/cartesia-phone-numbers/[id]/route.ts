export const runtime = "nodejs";
import { deleteCartesiaPhoneNumber } from "@/lib/cartesia";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!process.env.CARTESIA_API_KEY) {
    return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 500 });
  }
  try {
    await deleteCartesiaPhoneNumber(params.id);
    return Response.json({ ok: true });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Failed to release this number" }, { status: 500 });
  }
}
