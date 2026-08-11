-- RLS policies for anon access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'anon_all_users') THEN
    CREATE POLICY "anon_all_users" ON public.users FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'career_contexts' AND policyname = 'anon_all_career_contexts') THEN
    CREATE POLICY "anon_all_career_contexts" ON public.career_contexts FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessments' AND policyname = 'anon_all_assessments') THEN
    CREATE POLICY "anon_all_assessments" ON public.assessments FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessment_turns' AND policyname = 'anon_all_assessment_turns') THEN
    CREATE POLICY "anon_all_assessment_turns" ON public.assessment_turns FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'diagnoses' AND policyname = 'anon_all_diagnoses') THEN
    CREATE POLICY "anon_all_diagnoses" ON public.diagnoses FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'baseline_snapshots' AND policyname = 'anon_all_baseline_snapshots') THEN
    CREATE POLICY "anon_all_baseline_snapshots" ON public.baseline_snapshots FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END
$$;
