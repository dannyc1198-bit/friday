import { BusinessPage } from "@/components/console/BusinessPage";

export default function Page() {
  return (
    <BusinessPage
      kicker="Wavelength Solutions"
      title="Wavelength"
      detail="Websites, AI receptionists, automations. Drafts stay drafts until you approve a send."
      empty="No lead file is attached to this page. These actions open Talk with a draft request."
      actions={[
        { label: "Lead list", hint: "Who is waiting, from the vault.", prompt: "List my current Wavelength Solutions leads from the brain. Skip archive notes. Drafts only." },
        { label: "Draft outreach", hint: "Writes a draft. Does not send it.", prompt: "Draft outreach for Wavelength Solutions. Websites, AI receptionists, automations. Do not send it." },
        { label: "Today's calls", hint: "The calls that belong to today.", prompt: "What Wavelength Solutions calls should I make today? One list, current notes only." },
      ]}
    />
  );
}
