import { Pool } from 'pg';
import pool from '../config/database';

/**
 * The three study contexts.
 *
 * Contexts 1 and 2 are copied VERBATIM from backend/src/seeds/topics.seed.ts (ids 1 and 2)
 * at baseline commit 4116767: stimulus_text -> participant_scenario,
 * topic_specific_policy -> agent_policy, plus title / domain / scenario_type.
 *
 * Context 3 (food_informational) is a PLACEHOLDER — replace with the team's document.
 * Everything in it (policy, order record, scenario) is fabricated and lives only in this
 * file so that swapping in the real material is a single edit. It is the study's control
 * context: same domain as contexts 1-2, but nothing has gone wrong — the customer only
 * wants information about a just-placed order.
 *
 * The placeholder marker exists ONLY at code level (this comment, the per-field comments
 * below, and INFORMATIONAL_CONTEXT_PLACEHOLDER_NOTE, which `npm run seed` prints). It must never be
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
export const INFORMATIONAL_CONTEXT_PLACEHOLDER_NOTE =
  'PLACEHOLDER — replace with the team\'s document. The policy, order record, and scenario for context 3 (food_informational) are fabricated for development and pilot testing; edit backend/src/seeds/contexts.seed.ts to swap in the real material.';

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
    code: 'food_informational',
    title: 'Delivery Order Inquiry',
    domain: 'Food Delivery',
    scenario_type: 'informational',
    // PLACEHOLDER — replace with the team's document (second-person participant scenario).
    participant_scenario: `You just ordered dinner through a delivery app from Olive & Thyme, a Mediterranean restaurant you have not tried before. The order went through smoothly—a grilled chicken souvlaki plate, a falafel wrap, lemon herb roasted potatoes, and baklava, under order number FD-83921—and the kitchen is preparing it now. Nothing is wrong; you are simply curious. You want to know when the food will arrive and how the delivery time is estimated, what goes into each dish and whether anything contains allergens, how the food is packaged and presented, and how delivery works from kitchen to door. You open the support chat to ask about your order.`,
    // PLACEHOLDER — replace with the team's document (order record + factual reference information).
    // Keep this text free of any placeholder / fabricated / fictional wording: it is prompt-visible.
    // Keep it PURELY FACTUAL: no emotional-intelligence directives (the EI manipulation lives only
    // in the condition guidance blocks) and no complaint-remediation framing (nothing is wrong).
    // No customer name anywhere (the order number is the anchor); no weekdays or calendar dates.
    agent_policy: `FOOD DELIVERY SUPPORT — ORDER INFORMATION REFERENCE

ORDER RECORD ON FILE
Order number: FD-83921
Restaurant: Olive & Thyme (Mediterranean); the food is cooked in the restaurant's own kitchen
Items:
- 1x Grilled Chicken Souvlaki Plate — $16.50
- 1x Falafel Wrap — $11.25
- 1x Lemon Herb Roasted Potatoes (side) — $6.75
- 1x Baklava (2 pieces) — $5.50
Subtotal: $40.00
Delivery fee: $3.99
Service fee (10% of subtotal): $4.00
Tax (8% of subtotal): $3.20
Total: $51.19, paid in full through the app at checkout
Time placed: 6:40 PM this evening
Estimated delivery window: 7:25 PM to 7:40 PM (45 to 60 minutes after checkout)
Delivery address: the residential address saved in the customer's app profile, about 2.4 miles from the restaurant
Handoff preference: hand to the customer at the door (contactless drop-off can be switched on any time before arrival)

MENU & INGREDIENT INFORMATION (ITEMS ON THIS ORDER)

Grilled Chicken Souvlaki Plate
- Ingredients: chicken breast marinated in olive oil, lemon juice, garlic, dried oregano, and black pepper, grilled on skewers; rice pilaf (basmati rice, orzo, butter, vegetable stock); tzatziki sauce (strained yogurt, cucumber, garlic, dill, olive oil); tomato-and-cucumber salad; one warm pita.
- Allergens: dairy (butter, yogurt); gluten/wheat (orzo, pita).
- Prep notes: grilled to order over an open flame; not spicy; tzatziki packed on the side.

Falafel Wrap
- Ingredients: falafel (chickpeas, onion, parsley, cilantro, garlic, cumin, coriander, baking soda, sesame seeds) fried in sunflower oil; tahini sauce (ground sesame, lemon juice, garlic); lettuce; tomato; pickled turnip; wheat-flour lavash flatbread.
- Allergens: sesame (falafel and tahini); gluten/wheat (lavash).
- Prep notes: fully plant-based; mildly seasoned; tahini drizzled inside the wrap.

Lemon Herb Roasted Potatoes (side)
- Ingredients: potatoes, olive oil, lemon juice, garlic, dried oregano, rosemary, sea salt, black pepper.
- Allergens: none of the major allergens.
- Prep notes: oven-roasted; plant-based; made without gluten-containing ingredients.

Baklava (2 pieces)
- Ingredients: phyllo pastry (wheat flour), walnuts, pistachios, butter, sugar, honey, lemon juice, cinnamon.
- Allergens: tree nuts (walnuts, pistachios); gluten/wheat (phyllo); dairy (butter).
- Prep notes: baked fresh each morning; served at room temperature.

Cross-contact note: all items come from one shared kitchen, so no item can be guaranteed completely free of any allergen; full ingredient statements for other menu items are available on request.

PACKAGING & PRESENTATION
- Hot items (souvlaki plate, potatoes) travel in vented compostable fiber containers that hold heat while letting steam escape, so nothing arrives soggy.
- The falafel wrap is rolled in foil-lined paper and sleeved to keep its shape.
- Sauces ship in separate sealed 2 oz cups, and the pita is wrapped in foil, so nothing soaks in transit.
- The baklava is boxed on its own, away from the hot items, so the pastry stays crisp.
- Every container is closed with a tamper-evident seal, and the full order travels in a sealed insulated thermal bag labeled with the order number.
- A printed order slip is inside the bag. Cutlery and napkins are included only when "include utensils" is selected at checkout; it was not selected on this order.

DELIVERY PROCESS (ORDER CONFIRMATION TO DROP-OFF)
1. Order confirmed — the restaurant accepts the order within about a minute of checkout; the app status changes to "Preparing".
2. Preparation — the kitchen cooks the order; this restaurant's typical prep time at dinner hours is 20 to 25 minutes.
3. Courier assignment — a nearby courier is matched shortly before the food is ready; the courier's photo and vehicle type appear on the tracking screen.
4. Pickup — the courier matches the order number on the bag to the app and checks the seals before leaving.
5. In transit — the app shows the courier's live location on a map; the arrival estimate updates in real time.
6. Drop-off — the courier hands over the bag at the door, or leaves it with a photo confirmation when contactless drop-off is selected. The app sends a notification at pickup and again on arrival.

How the estimate is computed: the quoted window combines the kitchen's current load, the restaurant's average prep time, the distance to the delivery address, and live traffic; it updates automatically in the app whenever any of these change.

GENERAL INFORMATION
- Olive & Thyme accepts delivery orders from 11:00 AM to 9:30 PM daily.
- Delivery radius: about 6 miles; this order's address is well inside it.
- Fees: the delivery fee ranges from $1.99 to $5.99 by distance; a 10% service fee applies to every order; orders under $15.00 carry a $2.00 small-order fee (not applied here). Tips go entirely to the courier and can be adjusted up to 2 hours after delivery.
- Changes: items can be added or removed from the order screen while the status is "Preparing"; once the courier picks up the bag, the order is final.
- If a problem ever arises with a delivery, standard support processes exist in the app's help section.`,
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
