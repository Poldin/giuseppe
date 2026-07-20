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
  numero_riferimento text,
  data_ricezione date,
  link_pdf_allegato text,
  data_acquisizione date,
  other jsonb,
  CONSTRAINT recalls_medical_device_pkey PRIMARY KEY (id),
  CONSTRAINT recalls_medical_device_numero_riferimento_key UNIQUE (numero_riferimento)
);