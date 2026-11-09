
-- STAGING ONLY. Do not reuse real receipts or payment images.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('grandslam-staging-slips','grandslam-staging-slips',false,1048576,
        ARRAY['image/jpeg','image/png']::text[]);
CREATE POLICY "staging_slips_upload_to_own_folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
 bucket_id='grandslam-staging-slips'
 AND (storage.foldername(name))[1]=(select auth.uid())::text
);
CREATE POLICY "staging_slips_read_own_or_admin"
ON storage.objects FOR SELECT TO authenticated
USING (
 bucket_id='grandslam-staging-slips'
 AND ((storage.foldername(name))[1]=(select auth.uid())::text
      OR ((select auth.jwt())->'app_metadata'->>'role')='admin')
);
-- No UPDATE or DELETE policy; replacement and deletion need a vetted backend.
