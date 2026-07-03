import Link from "next/link";

import { AuroraText } from "@/components/ui/aurora-text";
import { Button } from "@/components/ui/button";

import { Section } from "../section";

export function CommunitySection() {
  return (
    <Section
      title={
        <AuroraText colors={["#60A5FA", "#A5FA60", "#A560FA"]}>
          Start Working
        </AuroraText>
      }
      subtitle="Open the workspace and start a task with research, tools, files, and sandboxed execution."
    >
      <div className="flex justify-center">
        <Button className="text-xl" size="lg" asChild>
          <Link href="/workspace">Open Workspace</Link>
        </Button>
      </div>
    </Section>
  );
}
