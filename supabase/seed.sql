-- ============================================================
-- INVITE LIME — seed data
-- Categories, products, templates, template versions, site settings.
-- Idempotent: safe to run multiple times.
-- ============================================================

-- --- CATEGORIES -------------------------------------------------
insert into public.categories (name, slug, description) values
  ('Muslim Wedding',   'muslim-wedding',   'Nikah & Walima focused invitation suites'),
  ('Hindu Vivah',      'hindu-vivah',      'Sangeet, Mehendi, Pheras & multi-day Hindu ceremonies'),
  ('Christian',        'christian',        'Western church & reception invitations'),
  ('Royal Luxury',     'royal-luxury',     'Gold foil, palace heritage and opulent designs'),
  ('Minimalist',       'minimalist',       'Clean editorial Swiss-style typography'),
  ('Traditional',      'traditional',      'Classic heritage stationery'),
  ('Destination',      'destination',      'Travel, resort and destination wedding suites'),
  ('Floral',           'floral',           'Botanical & garden inspired motifs'),
  ('Multi-Event',      'multi-event',      'Multiple ceremony timeline support'),
  ('Heritage',         'heritage',         'Timeless cultural legacy suites'),
  ('Sangeet',          'sangeet',          'Sangeet & mehendi focused layouts'),
  ('Botanical',        'botanical',        'Rustic botanical illustration style')
on conflict (slug) do nothing;

-- --- PRODUCTS (server-side price source of truth, in paise) -----
insert into public.products (name, description, price_paise, currency, active, metadata) values
  ('Royal Mughal Palace License', 'Perpetual interactive suite license for the Royal Mughal Palace template. Includes taxes & GST break-up, CDN hosting and RSVP webhook bridge.', 499900, 'INR', true, '{"tax_rate_1000ths":180,"tier":"Gold Atelier"}'),
  ('Atelier Minimaliste License', 'Perpetual interactive suite license for the Atelier Minimaliste template.', 299900, 'INR', true, '{"tax_rate_1000ths":180,"tier":"Silver Keepsake"}'),
  ('Aura of Jaipur License', 'Perpetual interactive suite license for the Aura of Jaipur template.', 449900, 'INR', true, '{"tax_rate_1000ths":180,"tier":"Gold Atelier"}'),
  ('Tuscan Olive & Linen License', 'Perpetual interactive suite license for the Tuscan Olive & Linen template.', 349900, 'INR', true, '{"tax_rate_1000ths":180,"tier":"Silver Keepsake"}'),
  ('Modern Paris Monogram License', 'Perpetual interactive suite license for the Modern Paris Monogram template.', 249900, 'INR', true, '{"tax_rate_1000ths":180,"tier":"Silver Keepsake"}'),
  ('Gilded Bosphorus License', 'Perpetual interactive suite license for the Gilded Bosphorus template.', 549900, 'INR', true, '{"tax_rate_1000ths":180,"tier":"Haute Couture"}'),
  ('Botanical Minimalist License', 'Perpetual interactive suite license for the Botanical Minimalist template.', 349900, 'INR', true, '{"tax_rate_1000ths":180,"tier":"Silver Keepsake"}')
on conflict (id) do nothing;

-- --- TEMPLATES ---------------------------------------------------
insert into public.templates (name, slug, description, status, product_id) values
  ('Royal Mughal Palace',
   'royal-mughal',
   'Gold arabesque trims with dual Nikah & Walima timeline cards and automated Quranic blessing audio.',
   'active',
   (select id from public.products where name = 'Royal Mughal Palace License')),
  ('Atelier Minimaliste',
   'atelier-minimaliste',
   'Crisp Swiss typography, full-screen bespoke photography grids, subtle parallax, and a discreet guest registry.',
   'active',
   (select id from public.products where name = 'Atelier Minimaliste License')),
  ('Aura of Jaipur',
   'aura-of-jaipur',
   'Vibrant marigold & royal indigo foil with dedicated Haldi, Mehendi, Sangeet & Pheras schedule nodes.',
   'active',
   (select id from public.products where name = 'Aura of Jaipur License')),
  ('Tuscan Olive & Linen',
   'tuscan-olive-linen',
   'Rustic botanical illustration with interactive venue card, airport transit details, and guest dress palette.',
   'active',
   (select id from public.products where name = 'Tuscan Olive & Linen License')),
  ('Modern Paris Monogram',
   'modern-paris-monogram',
   'Tailored monogram editorial suite with a refined Parisian palette and single RSVP flow.',
   'disabled',
   (select id from public.products where name = 'Modern Paris Monogram License')),
  ('Gilded Bosphorus Arabesque',
   'gilded-bosphorus',
   'Istanbul-inspired arabesque gold overlay with cinematic reveal sections.',
   'active',
   (select id from public.products where name = 'Gilded Bosphorus License')),
  ('Botanical Minimalist',
   'botanical-minimalist',
   'Soft vellum botanical accents with a rustic garden mood and multi-event countdown.',
   'active',
   (select id from public.products where name = 'Botanical Minimalist License'))
on conflict (slug) do nothing;

-- --- TEMPLATE CATEGORIES (many-to-many) --------------------------
insert into public.template_categories (template_id, category_id)
select t.id, c.id
from public.templates t
join public.categories c on 1 = 1
where
  (t.slug = 'royal-mughal'       and c.slug in ('muslim-wedding', 'royal-luxury', 'traditional'))
  or (t.slug = 'atelier-minimaliste' and c.slug in ('minimalist', 'christian'))
  or (t.slug = 'aura-of-jaipur'  and c.slug in ('hindu-vivah', 'heritage', 'multi-event', 'sangeet'))
  or (t.slug = 'tuscan-olive-linen' and c.slug in ('destination', 'floral', 'christian'))
  or (t.slug = 'modern-paris-monogram' and c.slug in ('minimalist', 'heritage'))
  or (t.slug = 'gilded-bosphorus' and c.slug in ('royal-luxury', 'traditional', 'muslim-wedding'))
  or (t.slug = 'botanical-minimalist' and c.slug in ('botanical', 'floral', 'minimalist'))
on conflict (template_id, category_id) do nothing;

-- --- TEMPLATE VERSIONS (immutable, v1.0.0 placeholder package) ----
insert into public.template_versions (template_id, version, storage_prefix, manifest, is_current, status)
select t.id, '1.0.0', 'templates/' || t.id || '/1.0.0',
  jsonb_build_object(
    'version', '1.0.0',
    'entry', 'index.html',
    'supported', jsonb_build_array('couple','gallery','events','rsvp','media')
  ),
  true, 'published'
from public.templates t
on conflict (template_id, version) do nothing;

-- --- SITE SETTINGS (marketing values are configured, not fabricated)
insert into public.site_settings (key, value) values
  ('site',          jsonb_build_object(
    'site_name', 'Invite Lime',
    'tagline', 'Haute Wedding Invitation Platform',
    'support_email', 'support@invite-lime.example'
  )),
  ('hero',          jsonb_build_object(
    'title', 'Create a Breathtaking Wedding Website',
    'subtitle', 'Design an enchanting digital invitation in minutes. Choose from couture animated templates, add your ceremonies, music, and registry, and share a personalized link that opens instantly on every smartphone.'
  )),
  ('marketing',     jsonb_build_object(
    'show_stats', false,
    'stats', jsonb_build_array()
  )),
  ('pricing',       jsonb_build_object(
    'currency', 'INR',
    'tiers', jsonb_build_array()
  )),
  ('faq',           jsonb_build_array(
    jsonb_build_object('q', 'Can I edit event timings or venues after sending the link out to guests?', 'a', 'Yes — completely without interrupting your link. Changes made in the couple console update the invitation immediately for every guest without changing your URL.'),
    jsonb_build_object('q', 'How does WhatsApp sharing work with guest names?', 'a', 'The batch link generator lets you type your guest list and send WhatsApp invitations with personal opening text and unique tracking parameters, so guests feel personally honored.'),
    jsonb_build_object('q', 'Will background music play automatically on mobile phones?', 'a', 'Mobile browsers require a user gesture before playing audio. Templates include an elegant Open Invitation interaction that activates the soundtrack natively within the browser rules.'),
    jsonb_build_object('q', 'What happens to our invitation after the event?', 'a', 'Your invitation remains online until its expiration date (wedding date + 2 months). During that window every feature, including RSVP tracking, stays live.')
  ))
on conflict (key) do nothing;

-- --- PER-CURRENCY PRICES -----------------------------------------
-- Mirrors the backfill in migration 00010 so a freshly seeded database has
-- international prices out of the box. Baseline rates rounded to whole currency
-- units — review/edit these rows (product_prices) for final pricing. Idempotent.
insert into public.product_prices (product_id, currency, amount_minor)
select p.id, 'INR', p.price_paise
from public.products p
on conflict (product_id, currency) do nothing;

with rates (currency, rate) as (
  values
    ('USD', 0.0120::numeric),
    ('EUR', 0.0110::numeric),
    ('GBP', 0.0095::numeric),
    ('AED', 0.0440::numeric),
    ('AUD', 0.0180::numeric),
    ('CAD', 0.0160::numeric),
    ('SGD', 0.0160::numeric)
)
insert into public.product_prices (product_id, currency, amount_minor)
select
  p.id,
  r.currency,
  (round((p.price_paise / 100.0) * r.rate) * 100)::bigint
from public.products p
cross join rates r
on conflict (product_id, currency) do nothing;