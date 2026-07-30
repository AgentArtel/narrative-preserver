
CREATE POLICY "storyforge_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'storyforge');
CREATE POLICY "storyforge_own_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'storyforge' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "storyforge_own_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'storyforge' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "storyforge_own_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'storyforge' AND (storage.foldername(name))[1] = auth.uid()::text);
