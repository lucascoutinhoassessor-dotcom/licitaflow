BEGIN;
REVOKE ALL ON public.quadro_posts,public.quadro_recomendacoes FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.quadro_posts TO authenticated;
GRANT SELECT,UPDATE ON public.quadro_recomendacoes TO authenticated;
COMMIT;
