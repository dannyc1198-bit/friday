import { BusinessPage } from "@/components/console/BusinessPage";

export default function Page() {
  return (
    <BusinessPage
      kicker="Wavelength Property Services"
      title="Property"
      detail="Listings and follow-ups stay drafts. This page does not store a property database."
      empty="No property records are stored in Friday yet. Ask for a draft and it opens in Talk."
      actions={[
        { label: "Open listings", hint: "Current notes only. Nothing is published.", prompt: "List current Wavelength Property Services notes. Skip archive. Drafts only. Do not send or spend." },
        { label: "Follow-ups", hint: "Who to contact next. Does not message them.", prompt: "Which Wavelength Property Services follow-ups are due? Draft only. Do not send messages." },
        { label: "Maintenance draft", hint: "A note you can edit. Not an order.", prompt: "Draft a Wavelength Property Services maintenance note. Do not send it, spend, or place an order." },
      ]}
    />
  );
}
