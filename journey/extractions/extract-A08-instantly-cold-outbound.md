# A-08: Instantly AI Sales Agent, hands-off cold outbound
source: How_to_Set_Up_an_AI_Sales_Agent___Automate_Your_Outreach_mp3.txt
context: Instantly.ai staff host, product-launch webinar. Not a mortgage professional, not Canadian-identified. Sells the platform, credits, an academy, a managed service.

## Big idea
Hand the whole outbound loop to an agent that finds its own list, writes one email per person, and answers replies unsupervised.

## Patterns
- PLAYBOOK FROM A PUBLIC ARTIFACT: website → drafted offers, personas, problems, proof → human edits each field → all outbound copy. One memory layer, corrections propagate.
- PER-RECIPIENT MESSAGE: enriched record plus playbook → one email per person, three follow-ups on new angles → no gate. Personalization comes from the record.
- STANDING RULES OVER EDITS: observed output → ten guidance rules → every future send. Steer the generator, not the artifact.
- FIRST-TOUCH PRIORITIZATION: fixed daily capacity → first touches ahead of follow-ups, because replies concentrate in messages one and two.
- CHANNEL MATCHING: sender infrastructure matched to recipient → better inbox placement. Delivery is routing, not copy.
- CLOSING NUDGE: last touch says plainly it is the last. Loss aversion pulls replies a polite fourth would not.

## Human-in-the-loop
- Setup only: playbook, ICP keywords, guidance rules. Host suggests human loop first, then demos autopilot.
- Full automation after. No per-message approval, no edit or delete of a queued email, no lead removal, no export. The digest is the only oversight.

## Stack mentioned
Instantly SuperSearch, AI Sales and Reply Agents, Slack, HubSpot, Apollo. Fox equivalents: Zoho, Claude for playbook and copy, n8n for sends, Radar queue for oversight. No list buying, the book is first-party.

## Claims
[self-reported, vendor sells credits, an academy, a managed service]
- Five credits per lead end to end, charged on send, not per booked meeting.
- Subject lines tuned on billions of data points.
- 2% reply rate as a conservative planning number.

## Failure modes
- Thin public data on local businesses yields weaker emails. No bring-your-own list, no lead deletion, no HTML, English only.
- One attendee reported follow-ups not sending, another a duplicate email and subject line.
- Host could not confirm webhook or CRM sync coverage.

## Compliance flags
- No consent model. Database-sourced commercial email needs CASL consent, sender identification, and a real unsubscribe. Reply-and-I-will-remove-you is not one.
- Buying secondary domains to shield the main one is deliverability evasion. The vendor scrapes sites and holds third-party PII.
- An unsupervised reply agent booking meetings crosses FSRA lines.

## Fox fit
Cold-only, park it. Nothing here loads Mike's own book and the consent posture fails in Canada. Two primitives transfer to RENEW and POST-FUND: an editable playbook feeding every message, and standing rules over per-message edits.
