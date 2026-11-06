-- «اتسمعت» للرسائل الصوتية: بتتسجل أول مرة المستلم يشغّل الفويس.
alter table public.direct_messages add column if not exists played_at timestamptz;
