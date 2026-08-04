-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.brands (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text,
  image_url text,
  CONSTRAINT brands_pkey PRIMARY KEY (id)
);
CREATE TABLE public.manufacturers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  full_legal_name text,
  gs1_prefix text,
  hibc_lic text,
  metadata jsonb,
  srn_code text,
  VAT text,
  fiscal_code text,
  legal_name_norm text,
  url_image text,
  CONSTRAINT manufacturers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.master_catalog (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  tags ARRAY DEFAULT '{}'::text[],
  brand_id uuid,
  default_min_stock numeric DEFAULT 5,
  created_at timestamp with time zone DEFAULT now(),
  sku text,
  image_url text,
  ean text,
  metadata jsonb,
  default_description text,
  udi_di text,
  hibc_primary text,
  manufacturer_id uuid,
  search_payload text,
  aic_code text,
  cod_catalogo_fabbr_ass text,
  search_payload_tsvector tsvector,
  log_execution_cleaning text,
  CONSTRAINT master_catalog_pkey PRIMARY KEY (id),
  CONSTRAINT master_catalog_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id),
  CONSTRAINT master_catalog_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  sku text,
  category text,
  min_stock_level numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  image_url text,
  description text,
  master_catalogue_id uuid,
  metadata jsonb,
  ean text,
  brand_id uuid,
  udi_di text,
  hibc_primary text,
  manufacturer_id uuid,
  aic_code text,
  whearhouse_id uuid,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id),
  CONSTRAINT products_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id),
  CONSTRAINT products_master_catalogue_id_fkey FOREIGN KEY (master_catalogue_id) REFERENCES public.master_catalog(id),
  CONSTRAINT products_whearhouse_id_fkey FOREIGN KEY (whearhouse_id) REFERENCES public.whearhouses(id)
);
CREATE TABLE public.product_batch (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL,
  batch_number text DEFAULT ''::text,
  expiry_date date,
  quantity numeric NOT NULL DEFAULT 0,
  last_updated timestamp with time zone DEFAULT now(),
  price numeric DEFAULT '0'::numeric CHECK (price >= 0::numeric),
  location text,
  udi_pi text,
  hibc_secondary text,
  VAT numeric CHECK ("VAT" >= 0::numeric),
  CONSTRAINT product_batch_pkey PRIMARY KEY (id),
  CONSTRAINT product_batch_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.whearhouses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  w_name text,
  other jsonb,
  CONSTRAINT whearhouses_pkey PRIMARY KEY (id)
);
CREATE TABLE public.stock_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  type text,
  batch_id uuid,
  other jsonb,
  CONSTRAINT stock_movements_pkey PRIMARY KEY (id),
  CONSTRAINT stock_movements_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.product_batch(id)
);
CREATE TABLE public.reorders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  product_name text,
  notes text,
  edited_at timestamp with time zone,
  completed_at timestamp with time zone,
  warehouse_id uuid,
  quantity integer,
  CONSTRAINT reorders_pkey PRIMARY KEY (id),
  CONSTRAINT reorders_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.whearhouses(id)
);
CREATE TABLE public.product_search_chats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  query_text text NOT NULL,
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT product_search_chats_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ecommerce_brand (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text,
  logo_url text,
  other jsonb,
  domain text,
  CONSTRAINT ecommerce_brand_pkey PRIMARY KEY (id)
);
CREATE TABLE public.scraped_product (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  product_name text,
  final_price real,
  description text,
  ecommerce_id uuid,
  discount numeric,
  other jsonb,
  id_ecommerce text,
  brand text,
  update_at timestamp with time zone,
  is_escluded boolean,
  update_session_id text,
  pub_slug text,
  name_norm text DEFAULT lower(f_unaccent(COALESCE(product_name, ''::text))),
  search_tsv tsvector DEFAULT to_tsvector('simple'::regconfig, f_unaccent(COALESCE(product_name, ''::text))),
  search_tsv_it tsvector DEFAULT to_tsvector('italian'::regconfig, f_unaccent(COALESCE(product_name, ''::text))),
  CONSTRAINT scraped_product_pkey PRIMARY KEY (id),
  CONSTRAINT scraped_product_ecommerce_id_fkey FOREIGN KEY (ecommerce_id) REFERENCES public.ecommerce_brand(id)
);
CREATE TABLE public.review_giuseppe (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  body text,
  other jsonb,
  CONSTRAINT review_giuseppe_pkey PRIMARY KEY (id)
);
CREATE TABLE public.pub_related_click (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  from_product_id uuid NOT NULL,
  to_product_id uuid NOT NULL,
  from_pub_slug text,
  to_pub_slug text,
  CONSTRAINT pub_related_click_pkey PRIMARY KEY (id)
);
CREATE TABLE public.prices_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_price_recorded numeric,
  last_discount_recorded numeric,
  product_id uuid,
  CONSTRAINT prices_history_pkey PRIMARY KEY (id),
  CONSTRAINT prices_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.scraped_product(id)
);
CREATE TABLE public.compatibility_big_brands (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  brand_name text UNIQUE,
  other jsonb,
  CONSTRAINT compatibility_big_brands_pkey PRIMARY KEY (id)
);
CREATE TABLE public.compatibility_implants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  line_name text,
  platform_code text,
  big_brand_id uuid,
  other jsonb,
  CONSTRAINT compatibility_implants_pkey PRIMARY KEY (id),
  CONSTRAINT compatibility_implants_manufacturer_id_fkey FOREIGN KEY (big_brand_id) REFERENCES public.compatibility_big_brands(id)
);
CREATE TABLE public.compatibility_compatible_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  platform_id uuid,
  compatible_manufacturer_name text,
  product_type_name text,
  manufacturer_code text,
  other jsonb,
  product_specific_name text,
  CONSTRAINT compatibility_compatible_items_pkey PRIMARY KEY (id),
  CONSTRAINT compatibility_compatible_items_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.compatibility_implants(id)
);
CREATE TABLE public.recalls_medical_device (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  titolo_rss text,
  link_pagina text,
  data_pubblicazione date,
  fabbricante text,
  nome_dispositivo text,
  tipo_dispositivo text,
  numero_riferimento text UNIQUE,
  data_ricezione date,
  link_pdf_allegato text,
  data_acquisizione date,
  other jsonb,
  CONSTRAINT recalls_medical_device_pkey PRIMARY KEY (id)
);
CREATE TABLE public.medical_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  progressivo_dm_ass text NOT NULL UNIQUE,
  tipologia_dm text NOT NULL DEFAULT '1'::text,
  slug text NOT NULL UNIQUE,
  denominazione_commerciale text,
  fabbricante_assemblatore text,
  cod_fiscale text,
  partita_iva_vat text,
  cod_catalogo_fabbr_ass text,
  classificazione_cnd text,
  cnd_prefix text,
  descrizione_cnd text,
  iscrizione_repertorio text,
  dm_riferimento text,
  gruppo_dm_simili text,
  data_prima_pubblicazione date,
  data_inizio_validita date,
  data_fine_validita date,
  data_fine_commercio date,
  last_source_file text,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT medical_devices_pkey PRIMARY KEY (id)
);
CREATE TABLE public.log_md_banner (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  type text,
  page_url text,
  CONSTRAINT log_md_banner_pkey PRIMARY KEY (id)
);
CREATE TABLE public.document_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  domain text,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT document_sources_pkey PRIMARY KEY (id)
);
CREATE TABLE public.manufacturer_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  source_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  asset_type text NOT NULL,
  file_url text NOT NULL,
  product_name text,
  last_seen_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT manufacturer_documents_pkey PRIMARY KEY (id),
  CONSTRAINT manufacturer_documents_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.document_sources(id)
);
CREATE TABLE public.product_combinations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  slug text UNIQUE,
  other jsonb,
  is_active boolean,
  CONSTRAINT product_combinations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.link_combinations_scraped_products (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  combination_id uuid,
  scraped_product_id uuid,
  CONSTRAINT link_combinations_scraped_products_pkey PRIMARY KEY (id),
  CONSTRAINT link_combinations_scraped_products_combination_id_fkey FOREIGN KEY (combination_id) REFERENCES public.product_combinations(id),
  CONSTRAINT link_combinations_scraped_products_scraped_product_id_fkey FOREIGN KEY (scraped_product_id) REFERENCES public.scraped_product(id)
);
CREATE TABLE public.aifa_releases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  published_on date NOT NULL UNIQUE,
  source_path text,
  source_file_name text,
  file_checksum text,
  row_count integer,
  imported_at timestamp with time zone NOT NULL DEFAULT now(),
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT aifa_releases_pkey PRIMARY KEY (id)
);
CREATE TABLE public.aifa_active_ingredients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT aifa_active_ingredients_pkey PRIMARY KEY (id)
);
CREATE TABLE public.aifa_atc_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  code text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT aifa_atc_codes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.aifa_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT aifa_companies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.aifa_equivalence_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  code text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  active_ingredient_id uuid,
  atc_code_id uuid,
  reference_pack_label text,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT aifa_equivalence_groups_pkey PRIMARY KEY (id),
  CONSTRAINT aifa_equivalence_groups_active_ingredient_id_fkey FOREIGN KEY (active_ingredient_id) REFERENCES public.aifa_active_ingredients(id),
  CONSTRAINT aifa_equivalence_groups_atc_code_id_fkey FOREIGN KEY (atc_code_id) REFERENCES public.aifa_atc_codes(id)
);
CREATE TABLE public.aifa_medicines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  aic text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  pack_description text,
  company_id uuid,
  active_ingredient_id uuid,
  equivalence_group_id uuid,
  atc_code_id uuid,
  prezzo_riferimento_ssn numeric,
  prezzo_pubblico numeric,
  differenza numeric,
  nota text,
  release_id uuid,
  first_release_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT aifa_medicines_pkey PRIMARY KEY (id),
  CONSTRAINT aifa_medicines_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.aifa_companies(id),
  CONSTRAINT aifa_medicines_active_ingredient_id_fkey FOREIGN KEY (active_ingredient_id) REFERENCES public.aifa_active_ingredients(id),
  CONSTRAINT aifa_medicines_equivalence_group_id_fkey FOREIGN KEY (equivalence_group_id) REFERENCES public.aifa_equivalence_groups(id),
  CONSTRAINT aifa_medicines_atc_code_id_fkey FOREIGN KEY (atc_code_id) REFERENCES public.aifa_atc_codes(id),
  CONSTRAINT aifa_medicines_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.aifa_releases(id),
  CONSTRAINT aifa_medicines_first_release_id_fkey FOREIGN KEY (first_release_id) REFERENCES public.aifa_releases(id)
);
CREATE TABLE public.aifa_medicine_price_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  medicine_id uuid NOT NULL,
  aic text NOT NULL,
  release_id uuid NOT NULL,
  published_on date NOT NULL,
  prezzo_riferimento_ssn numeric,
  prezzo_pubblico numeric,
  differenza numeric,
  nota text,
  equivalence_group_code text,
  CONSTRAINT aifa_medicine_price_history_pkey PRIMARY KEY (id),
  CONSTRAINT aifa_medicine_price_history_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.aifa_medicines(id),
  CONSTRAINT aifa_medicine_price_history_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.aifa_releases(id)
);
CREATE TABLE public.homesearch_session (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  other jsonb,
  CONSTRAINT homesearch_session_pkey PRIMARY KEY (id)
);
CREATE TABLE public.homesearch_query (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  session_id uuid,
  query text,
  results jsonb,
  other jsonb,
  CONSTRAINT homesearch_query_pkey PRIMARY KEY (id),
  CONSTRAINT homesearch_query_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.homesearch_session(id)
);
CREATE TABLE public.product_type_category (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  run_key text NOT NULL,
  source_cluster_id integer NOT NULL,
  slug text NOT NULL UNIQUE,
  mechanical_label text NOT NULL,
  seo_title text,
  kind text,
  seo_action text,
  cohesion numeric,
  size_at_run integer,
  is_brand_bucket boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  lander_slug text,
  CONSTRAINT product_type_category_pkey PRIMARY KEY (id)
);
CREATE TABLE public.link_scraped_product_type_category (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  scraped_product_id uuid NOT NULL,
  category_id uuid NOT NULL,
  run_key text NOT NULL,
  CONSTRAINT link_scraped_product_type_category_pkey PRIMARY KEY (id),
  CONSTRAINT link_sptc_scraped_fkey FOREIGN KEY (scraped_product_id) REFERENCES public.scraped_product(id),
  CONSTRAINT link_sptc_category_fkey FOREIGN KEY (category_id) REFERENCES public.product_type_category(id)
);
CREATE TABLE public.seo_tag (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  label text NOT NULL,
  slug text NOT NULL UNIQUE,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT seo_tag_pkey PRIMARY KEY (id)
);
CREATE TABLE public.link_scraped_product_seo_tag (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  scraped_product_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  position smallint NOT NULL DEFAULT 1,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT link_scraped_product_seo_tag_pkey PRIMARY KEY (id),
  CONSTRAINT link_scraped_product_seo_tag_scraped_product_id_fkey FOREIGN KEY (scraped_product_id) REFERENCES public.scraped_product(id),
  CONSTRAINT link_scraped_product_seo_tag_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.seo_tag(id)
);
CREATE TABLE public.scraped_product_seo_faq (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  scraped_product_id uuid NOT NULL,
  position smallint NOT NULL DEFAULT 1,
  question text NOT NULL,
  answer text NOT NULL,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT scraped_product_seo_faq_pkey PRIMARY KEY (id),
  CONSTRAINT scraped_product_seo_faq_scraped_product_id_fkey FOREIGN KEY (scraped_product_id) REFERENCES public.scraped_product(id)
);
CREATE TABLE public.scraped_product_seo_description (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  scraped_product_id uuid NOT NULL UNIQUE,
  description text NOT NULL,
  other jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT scraped_product_seo_description_pkey PRIMARY KEY (id),
  CONSTRAINT scraped_product_seo_description_scraped_product_id_fkey FOREIGN KEY (scraped_product_id) REFERENCES public.scraped_product(id)
);