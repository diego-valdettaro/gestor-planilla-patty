import { redirect } from "next/navigation";

export default function Inicio(): never {
  redirect("/turnos");
}
