/**
 * GA4 event registry for Burnt Beats.
 * Mark events as conversions in GA4 Admin using `ga4Conversion: true` rows below.
 */
export interface TrackingEventDefinition {
  /** GA4 recommended object_action name */
  name: string;
  category: "marketing" | "billing" | "activation" | "product" | "system";
  description: string;
  /** Register as a GA4 conversion in Admin → Events */
  ga4Conversion?: boolean;
}

export const GA4_TRACKING_PLAN: TrackingEventDefinition[] = [
  { name: "signup_completed", category: "marketing", description: "New account created via Clerk", ga4Conversion: true },
  { name: "landing_plan_intent_captured", category: "marketing", description: "Visitor chose a plan on landing pricing" },
  { name: "pricing_plan_selected", category: "marketing", description: "Plan selected on in-app pricing page" },
  { name: "plan_selected", category: "billing", description: "Checkout plan chosen" },
  { name: "checkout_started", category: "billing", description: "Stripe checkout session created", ga4Conversion: true },
  { name: "checkout_redirected", category: "billing", description: "Browser redirected to Stripe Checkout" },
  { name: "checkout_returned_success", category: "billing", description: "Returned from Stripe with success", ga4Conversion: true },
  { name: "checkout_returned_cancelled", category: "billing", description: "Returned from Stripe after cancel" },
  { name: "checkout_failed", category: "billing", description: "Checkout session creation failed" },
  { name: "checkout_preprompt_shown", category: "billing", description: "Paywall shown before split" },
  { name: "paywall_impression", category: "billing", description: "Upgrade surface shown" },
  { name: "paywall_cta_clicked", category: "billing", description: "Upgrade CTA clicked" },
  { name: "cancel_flow_started", category: "billing", description: "User opened cancel subscription flow" },
  { name: "cancel_reason_selected", category: "billing", description: "Exit survey reason chosen" },
  { name: "save_offer_shown", category: "billing", description: "Retention offer displayed" },
  { name: "save_offer_accepted", category: "billing", description: "Retention offer accepted" },
  { name: "save_offer_declined", category: "billing", description: "Retention offer declined" },
  { name: "billing_portal_open_started", category: "billing", description: "Stripe customer portal open requested" },
  { name: "billing_portal_redirected", category: "billing", description: "Redirected to Stripe portal" },
  { name: "billing_portal_failed", category: "billing", description: "Portal open failed" },
  { name: "subscription_fetch_failed", category: "system", description: "Billing status API error" },
  { name: "legal_gate_shown", category: "activation", description: "Legal acceptance gate displayed" },
  { name: "legal_accept_submit", category: "activation", description: "User submitted legal acceptance" },
  { name: "legal_accept_failed", category: "activation", description: "Legal acceptance API failed" },
  { name: "track_upload_selected", category: "product", description: "Audio file chosen for split" },
  { name: "track_upload_rejected_format", category: "product", description: "Unsupported upload format" },
  { name: "track_upload_cleared", category: "product", description: "Upload cleared" },
  { name: "split_started", category: "product", description: "Stem split job started", ga4Conversion: true },
  { name: "split_completed", category: "product", description: "Stem split finished successfully" },
  { name: "split_failed", category: "product", description: "Stem split failed" },
  { name: "split_failed_validation", category: "product", description: "Split blocked by validation" },
  { name: "split_blocked_subscription_inactive", category: "product", description: "Split blocked — inactive subscription" },
  { name: "expand_started", category: "product", description: "2-stem expand to 4-stem started" },
  { name: "expand_completed", category: "product", description: "Expand finished" },
  { name: "expand_failed", category: "product", description: "Expand failed" },
  { name: "export_started", category: "product", description: "Mix export started" },
  { name: "export_completed", category: "product", description: "Mix export finished", ga4Conversion: true },
  { name: "export_failed", category: "product", description: "Export failed" },
  { name: "export_failed_validation", category: "product", description: "Export blocked by validation" },
  { name: "export_blocked_cooldown", category: "product", description: "Export rate-limited" },
  { name: "midi_upload_selected", category: "product", description: "File chosen for MIDI conversion" },
  { name: "midi_convert_started", category: "product", description: "MIDI conversion started" },
  { name: "midi_convert_completed", category: "product", description: "MIDI conversion succeeded" },
  { name: "midi_convert_failed", category: "product", description: "MIDI conversion failed" },
  { name: "midi_download_started", category: "product", description: "MIDI file download started" },
  { name: "midi_batch_convert_started", category: "product", description: "Batch MIDI conversion started" },
  { name: "midi_batch_stem_failed", category: "product", description: "Single stem failed in batch MIDI job" },
  { name: "midi_batch_convert_finished", category: "product", description: "Batch MIDI conversion finished" },
  { name: "midi_batch_cancelled", category: "product", description: "User cancelled an in-flight batch conversion" },
  { name: "midi_empty_transcription_completed", category: "product", description: "MIDI conversion completed with zero notes" },
  { name: "midi_preview_render_completed", category: "product", description: "MIDI preview audio render succeeded" },
  { name: "midi_upgrade_cta_clicked", category: "product", description: "MIDI upgrade or token CTA clicked" },
  { name: "speech_upload_selected", category: "product", description: "Speech enhance upload chosen" },
  { name: "speech_upload_cleared", category: "product", description: "Speech upload cleared" },
  { name: "speech_upload_rejected_format", category: "product", description: "Unsupported speech upload format" },
  { name: "speech_enhance_started", category: "product", description: "Speech enhance job started" },
  { name: "speech_enhance_completed", category: "product", description: "Speech enhance finished" },
  { name: "speech_enhance_failed", category: "product", description: "Speech enhance failed" },
  { name: "feedback_submitted", category: "product", description: "In-app feedback sent" },
];

export const GA4_CONVERSION_EVENTS = GA4_TRACKING_PLAN.filter((event) => event.ga4Conversion).map(
  (event) => event.name,
);

export const GA4_EVENT_NAMES = new Set(GA4_TRACKING_PLAN.map((event) => event.name));
