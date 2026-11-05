import type { Metadata } from "next";
import { Codice } from "./Codice";

export const metadata: Metadata = { title: "Registro del codice · Gergo" };

export default function CodicePage() {
  return <Codice />;
}
