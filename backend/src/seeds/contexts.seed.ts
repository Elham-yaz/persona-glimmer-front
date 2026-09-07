import { Pool } from 'pg';
import pool from '../config/database';

/**
 * The three study contexts.
 *
 * Contexts 1 and 2 are copied VERBATIM from backend/src/seeds/topics.seed.ts (ids 1 and 2)
 * at baseline commit 4116767: stimulus_text -> participant_scenario,
 * topic_specific_policy -> agent_policy, plus title / domain / scenario_type.
 *
 * Context 3 (hotel_informational) is a PLACEHOLDER — replace with the team's document.
 * Everything in it (policy, booking record, scenario) is fabricated and lives only in this
 * file so that swapping in the real material is a single edit.
 *
 * The placeholder marker exists ONLY at code level (this comment, the per-field comments
 * below, and HOTEL_CONTEXT_PLACEHOLDER_NOTE, which `npm run seed` prints). It must never be
 * part of participant_scenario or agent_policy: agent_policy is pasted verbatim into the
 * agent's system prompt (## Reference Information), and a model told that its reference
 * material is a fabricated placeholder can repeat that to participants.
 */

export interface ContextSeed {
  id: number;
  code: string;
  title: string;
  domain: string;
  scenario_type: 'utilitarian' | 'hedonic' | 'informational';
  participant_scenario: string;
  agent_policy: string;
}

/** Code-level marker for context 3; logged by the seed runner, never seeded or shown to the model. */
export const HOTEL_CONTEXT_PLACEHOLDER_NOTE =
  'PLACEHOLDER — replace with the team\'s document. The policy, booking record, and scenario for context 3 (hotel_informational) are fabricated for development and pilot testing; edit backend/src/seeds/contexts.seed.ts to swap in the real material.';

export const contexts: ContextSeed[] = [
  {
    id: 1,
    code: 'food_utilitarian',
    title: 'Missing Food Item',
    domain: 'Food Delivery',
    scenario_type: 'utilitarian',
    participant_scenario: `You ordered dinner for yourself and your family through a food delivery app. When the order arrived, you noticed that the main entrée—a large chicken shawarma platter that was meant to feed three people—was completely missing from the bag. The sides and drinks were there, but without the main dish, no one has enough to eat. You're hungry, your family is waiting, and you need this resolved.`,
    agent_policy: `POLICY: Handling Missing Items in Food Delivery

AGENT WORKFLOW:
1. Identify the customer's issue type: Missing item(s)
2. Request only essential information: Order reference, Affected item(s), Description of the issue
3. Categorize severity: High (entrée missing - cannot feed family)
4. Select resolution: Full refund OR Redelivery of missing item (customer choice)

RESOLUTION FOCUS:
- Prioritize getting food to the customer quickly
- Offer either redelivery of the missing item or full refund so they can order elsewhere
- Speed matters - family is hungry and waiting

ESCALATION TRIGGERS:
- Tampering, broken seals, or foreign objects reported
- Allergens missing or incorrect substitutions
- Food reported as undercooked, spoiled, or causing illness
- Repeated complaint from customer
- Customer requests action beyond authorization`,
  },
  {
    id: 2,
    code: 'food_hedonic',
    title: 'Messy Food Presentation',
    domain: 'Food Delivery',
    scenario_type: 'hedonic',
    participant_scenario: `You ordered a special meal from your favorite restaurant through a delivery app to celebrate a small personal milestone. When you opened the containers, the food was a complete mess—sauces had spilled everywhere, the presentation was ruined, toppings were scattered, and containers were crushed. Everything is technically edible, but the experience you were looking forward to is completely spoiled.`,
    agent_policy: `POLICY: Handling Poorly Presented Items in Food Delivery

AGENT WORKFLOW:
1. Identify the customer's issue type: Messy presentation affecting experience
2. Request only essential information: Order reference, Description of the issue
3. Categorize severity: Medium (messy but edible - experiential loss)
4. Select resolution: Partial refund OR Account credit

RESOLUTION FOCUS:
- Acknowledge the emotional disappointment - this was a special occasion
- The food is functional but the anticipated enjoyment is destroyed
- Offer credit or partial refund to make up for the ruined experience, not just functional loss
- Validate feelings about the special moment being spoiled

ESCALATION TRIGGERS:
- Tampering, broken seals, or foreign objects reported
- Food reported as undercooked, spoiled, or causing illness
- Repeated complaint from customer
- Customer requests action beyond authorization`,
  },
  {
    id: 3,
    code: 'hotel_informational',
    title: 'Hotel Booking Inquiry',
    domain: 'Hotel Booking',
    scenario_type: 'informational',
    // PLACEHOLDER — replace with the team's document (second-person participant scenario).
    participant_scenario: `You have an upcoming stay at the Harborview Grand Hotel. You booked a Deluxe King room with a harbor view for three nights, arriving Friday, October 17 and checking out Monday, October 20. The reservation is under your first name, Jordan, and your confirmation number is HG-7R4K2M. A friend may join you for the weekend and your plans are not fully settled yet, so you want to make sure the booking details on file are correct—the dates, the room type, and the nightly rate—and understand exactly how the hotel's cancellation policy applies to your reservation: how late you can cancel without being charged, what it would cost to cancel after that point, and whether you could change the dates instead. Nothing has gone wrong with your booking; you are simply contacting the hotel's support chat to confirm the details and get clear information before you commit to your plans.`,
    // PLACEHOLDER — replace with the team's document (hotel policy + fictional booking record).
    // Keep this text free of any placeholder / fabricated / fictional wording: it is prompt-visible.
    agent_policy: `HARBORVIEW GRAND HOTEL — GUEST RESERVATION POLICIES

1. CHECK-IN AND CHECK-OUT
- Check-in begins at 3:00 PM. Early check-in from 12:00 PM may be requested and is granted subject to availability at no charge; guaranteed early check-in (from 10:00 AM) can be purchased for $40.
- Check-out is by 11:00 AM. Late check-out until 1:00 PM is complimentary on request when occupancy allows; late check-out until 4:00 PM is $50. Departures after 4:00 PM are charged one additional night at the booked rate.
- A government-issued photo ID and a valid credit card in the guest's name are required at check-in. Guests must be at least 21 years old to register.

2. RESERVATION RATES
- Flexible Rate: fully refundable if cancelled before the cancellation deadline (see section 3); no prepayment; the card on file is charged at check-out.
- Advance Purchase Rate (typically 15% below the Flexible Rate): charged in full at the time of booking; non-refundable and non-changeable, except as noted in section 4.
- All rates are per room, per night; they exclude a 12% occupancy tax and a $28 nightly destination fee (covers Wi-Fi, fitness center, business center, and local calls) and are quoted for up to two adults. Each additional adult is $35 per night. Children 17 and under stay free in existing bedding.

3. CANCELLATION TIERS (FLEXIBLE RATE)
- Cancelled 72 hours (3 days) or more before 3:00 PM local time on the arrival date: no charge.
- Cancelled between 72 and 24 hours before 3:00 PM on the arrival date: one night's room rate plus tax is charged.
- Cancelled less than 24 hours before 3:00 PM on the arrival date, or not cancelled at all: the full reserved stay is charged (see section 5).
- Peak dates (December 20 through January 2, and city-wide event weekends flagged at booking) require cancellation 7 days before arrival; later cancellations forfeit the first two nights.
- Cancellations may be made online, in the mobile app, or through guest services. A cancellation number is issued and should be kept as proof of cancellation.

4. MODIFICATIONS
- Flexible Rate reservations may be modified (dates, room type, number of guests) free of charge until the cancellation deadline, subject to availability. The rate for new dates is the rate in effect at the time of the change.
- Shortening a stay after check-in is treated as an early departure: a fee equal to one night's rate applies unless notice is given by 11:00 AM on the day before the new departure date.
- Advance Purchase reservations cannot be changed. A one-time date change within the same calendar year may be requested at least 14 days before arrival for a $75 change fee, with any rate difference payable at the time of the change.

5. NO-SHOWS
- A guest who has not checked in by 11:59 PM on the arrival date without notifying the hotel is recorded as a no-show. The remainder of the reservation is cancelled, and the no-show charge is the full amount of the reserved stay (Flexible Rate) or the prepaid amount (Advance Purchase).

6. DEPOSITS, HOLDS, AND REFUNDS
- Flexible Rate: no deposit is taken. At check-in a hold of $100 per night (up to $500) is placed on the guest's card for incidentals and released within 5 to 7 business days after check-out.
- Advance Purchase: full prepayment at booking; the incidentals hold also applies at check-in.
- Refunds are issued to the original payment method within 7 to 10 business days.
- Documented emergencies (hospitalization, bereavement, government travel restrictions) may qualify for a one-time waiver of cancellation or no-show charges at the duty manager's discretion; supporting documentation is required within 14 days.

7. PETS
- Dogs and cats up to 50 lbs are welcome in designated pet-friendly rooms (maximum two pets per room) for a non-refundable fee of $75 per stay.
- Service animals stay free of charge in any room type.
- Pets may not be left unattended in guest rooms and are not permitted in the restaurant, pool area, or fitness center.

8. PARKING
- Valet parking: $45 per night with unlimited in-and-out privileges. Self-parking in the adjacent Harbor Street garage: $32 per night (no in-and-out privileges).

9. BREAKFAST AND DINING
- The Harborview Breakfast (buffet plus made-to-order eggs) is served daily from 6:30 to 10:30 AM (until 11:00 AM on weekends) in the Quayside Restaurant: $32 per adult, $16 per child aged 6 to 12, free for children 5 and under.
- The Bed & Breakfast package includes breakfast for two per night. Breakfast is not included in the Flexible or Advance Purchase rates unless the confirmation states otherwise.

10. OTHER HOUSE RULES
- All guest rooms and indoor public areas are non-smoking; a $350 cleaning fee is charged for smoking in a room.
- Cribs are free on request; rollaway beds are $30 per night in room types that permit them.

---------------------------------------------------------------
BOOKING RECORD ON FILE
Confirmation number: HG-7R4K2M
Guest first name: Jordan
Property: Harborview Grand Hotel, 200 Quayside Drive
Arrival: Friday, October 17, 2026 (check-in from 3:00 PM)
Departure: Monday, October 20, 2026 (check-out by 11:00 AM) — 3 nights
Room: Deluxe King, Harbor View (1 king bed, up to 2 adults), non-smoking, high floor requested
Guests on reservation: 2 adults
Rate plan: Flexible Rate — $289.00 per night, excluding 12% occupancy tax and the $28 nightly destination fee
Payment: no prepayment; card on file (ending 4417) charged at check-out
Estimated total: $867.00 room + $104.04 occupancy tax + $84.00 destination fee = $1,055.04
Cancellation deadline: Tuesday, October 14, 2026 at 3:00 PM local time (72 hours before arrival)
  - Cancel by the deadline: no charge
  - Cancel after the deadline but before 3:00 PM on Thursday, October 16: one night ($289.00) plus tax
  - Cancel after 3:00 PM on October 16, or no-show: full stay charged
Modifications: free until the cancellation deadline, subject to availability
Special requests noted: high floor, away from the elevator (requests are not guaranteed)
Parking: none reserved
Breakfast: not included
Pets: none noted
Booked: September 3, 2026 via the hotel website`,
  },
];

export async function seedContexts(db: Pool = pool): Promise<void> {
  for (const context of contexts) {
    await db.query(
      `INSERT INTO contexts
         (id, code, title, domain, scenario_type, participant_scenario, agent_policy)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         title = EXCLUDED.title,
         domain = EXCLUDED.domain,
         scenario_type = EXCLUDED.scenario_type,
         participant_scenario = EXCLUDED.participant_scenario,
         agent_policy = EXCLUDED.agent_policy,
         updated_at = NOW()`,
      [
        context.id,
        context.code,
        context.title,
        context.domain,
        context.scenario_type,
        context.participant_scenario,
        context.agent_policy,
      ]
    );
  }
}
