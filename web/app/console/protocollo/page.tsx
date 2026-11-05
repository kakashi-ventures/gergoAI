import type { Metadata } from "next";
import { Protocollo } from "./Protocollo";

export const metadata: Metadata = { title: "Come parla col braccio · Gergo" };

export default function ProtocolloPage() {
  return <Protocollo />;
}
