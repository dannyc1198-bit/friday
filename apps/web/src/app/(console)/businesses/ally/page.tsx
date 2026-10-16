import { BusinessPage } from "@/components/console/BusinessPage";

export default function Page() {
  return (
    <BusinessPage
      kicker="Ally Wellness Group"
      title="Ally"
      detail="With Russell Ally. Drafts only. No health claims. No income claims."
      empty="Prospects come from the vault when you ask. These buttons do not message anyone."
      actions={[
        { label: "Prospects", hint: "Current people, not the archive.", prompt: "Who are my current Ally Wellness and Enagic prospects? Skip archive notes." },
        { label: "Follow-ups", hint: "Who to talk to next. Does not message them.", prompt: "Which Ally Wellness follow-ups are due? Draft only. Do not send messages." },
        { label: "Compliant script", hint: "A script with no health or income claims.", prompt: "Draft a compliant Enagic K8 follow-up script for Ally Wellness under Russell Ally. No health claims. No income claims. Do not send it." },
      ]}
    />
  );
}
