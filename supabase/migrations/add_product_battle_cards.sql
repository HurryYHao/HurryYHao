-- Add product_battle_cards table
CREATE TABLE IF NOT EXISTS public.product_battle_cards (
    id BIGSERIAL PRIMARY KEY,
    goods_name VARCHAR(255) NOT NULL,
    summary_stats JSONB,
    best_session JSONB,
    worst_session JSONB,
    ai_analysis TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS product_battle_cards_goods_name_idx ON public.product_battle_cards(goods_name);
CREATE INDEX IF NOT EXISTS product_battle_cards_created_at_idx ON public.product_battle_cards(created_at);

-- Add RLS policies
ALTER TABLE public.product_battle_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON public.product_battle_cards
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable insert access for authenticated users" ON public.product_battle_cards
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable update access for authenticated users" ON public.product_battle_cards
    FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable delete access for authenticated users" ON public.product_battle_cards
    FOR DELETE USING (auth.uid() IS NOT NULL);
