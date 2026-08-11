-- ============ users ============
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  anonymous_user_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_users" ON public.users FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============ career_contexts ============
CREATE TABLE public.career_contexts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  anonymous_user_id UUID NOT NULL REFERENCES public.users(anonymous_user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  title TEXT NOT NULL DEFAULT '我的职场档案',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  CONSTRAINT career_contexts_status_check CHECK (status IN ('active', 'archived'))
);
CREATE INDEX career_contexts_user_idx ON public.career_contexts(anonymous_user_id, status);
ALTER TABLE public.career_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_career_contexts" ON public.career_contexts FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============ assessments ============
CREATE TABLE public.assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  anonymous_user_id UUID NOT NULL REFERENCES public.users(anonymous_user_id) ON DELETE CASCADE,
  career_context_id UUID NOT NULL REFERENCES public.career_contexts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'INITIAL',
  status TEXT NOT NULL DEFAULT 'started',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  model_version TEXT,
  prompt_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assessments_type_check CHECK (type IN ('INITIAL', 'FOLLOW_UP', 'REASSESSMENT')),
  CONSTRAINT assessments_status_check CHECK (status IN ('started', 'completed', 'abandoned'))
);
CREATE INDEX assessments_context_idx ON public.assessments(career_context_id, created_at DESC);
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_assessments" ON public.assessments FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============ assessment_turns ============
CREATE TABLE public.assessment_turns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  anonymous_user_id UUID NOT NULL,
  turn_index INTEGER NOT NULL,
  question TEXT,
  answer TEXT,
  target_dimension TEXT,
  classified JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, turn_index)
);
ALTER TABLE public.assessment_turns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_assessment_turns" ON public.assessment_turns FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============ diagnoses ============
CREATE TABLE public.diagnoses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  anonymous_user_id UUID NOT NULL,
  career_context_id UUID NOT NULL REFERENCES public.career_contexts(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL DEFAULT 'unclear',
  risk_level TEXT,
  risk_score INTEGER,
  confidence NUMERIC,
  five_dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  key_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  conclusion TEXT,
  report_data JSONB,
  model_version TEXT,
  prompt_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX diagnoses_assessment_idx ON public.diagnoses(assessment_id);
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_diagnoses" ON public.diagnoses FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============ baseline_snapshots ============
CREATE TABLE public.baseline_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  diagnosis_id UUID NOT NULL REFERENCES public.diagnoses(id) ON DELETE CASCADE,
  career_context_id UUID NOT NULL REFERENCES public.career_contexts(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  anonymous_user_id UUID NOT NULL,
  power_state INTEGER,
  resource_state INTEGER,
  information_state INTEGER,
  trust_state INTEGER,
  core_task_state INTEGER,
  issue_type TEXT,
  risk_level TEXT,
  confidence NUMERIC,
  snapshot_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX baseline_context_idx ON public.baseline_snapshots(career_context_id, created_at DESC);
ALTER TABLE public.baseline_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_baseline_snapshots" ON public.baseline_snapshots FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER career_contexts_updated_at BEFORE UPDATE ON public.career_contexts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER assessments_updated_at BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
