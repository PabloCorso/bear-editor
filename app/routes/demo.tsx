import { DemoView } from "~/demos/demo-view";
import { loadQwquu001Demo } from "~/demos/qwquu001";

export function meta() {
  return [{ title: "Demo · Bear Level Editor" }];
}

export default function Demo() {
  return <DemoView name="Building Warm up" loadDemo={loadQwquu001Demo} />;
}
