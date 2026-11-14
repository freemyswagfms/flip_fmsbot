-- v0.8.6 hotfix for already-applied migration 006.
-- Canonical fingerprints are independent of transfer direction. Safe to re-run.
DO $patch$
DECLARE definition text;
BEGIN
  definition:=pg_get_functiondef('public.flip_trade_bundle_reply(bigint,uuid,text,uuid)'::regprocedure);
  IF strpos(definition,$old$v_signature:=CASE WHEN v.sender_id<v.recipient_id$old$)>0 THEN
    EXECUTE replace(definition,
      $old$v_signature:=CASE WHEN v.sender_id<v.recipient_id$old$,
      $new$v_signature:=CASE WHEN array_to_string(v_offer,',')<=array_to_string(v_want,',')$new$);
  END IF;
END;
$patch$;
