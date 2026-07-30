
DROP POLICY "storyforge_public_read" ON storage.objects;
CREATE POLICY "storyforge_own_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'storyforge' AND (storage.foldername(name))[1] = auth.uid()::text);
