import { redirect } from "react-router";

export function loader() {
  return redirect("/internal/1", 302);
}
