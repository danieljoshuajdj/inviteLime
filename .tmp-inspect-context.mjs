import { createClient } from '@supabase/supabase-js';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const s3 = new S3Client({ region: process.env.B2_REGION ?? 'us-east-005', endpoint: process.env.B2_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APPLICATION_KEY } });
const { data } = await supabase.from('template_versions').select('version,storage_prefix,manifest,templates(name,slug)').order('created_at');
for (const row of data ?? []) {
  const entry = row.manifest?.entry || 'index.html';
  const key = `${row.storage_prefix}/${entry}`;
  let html = '';
  try { const out = await s3.send(new GetObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: key })); html = await out.Body.transformToString(); } catch { continue; }
  const needles = ['invite-lime.com','invitelime.in','visit our website','visit website','website'];
  const hits = [];
  for (const needle of needles) {
    let idx = -1;
    while ((idx = html.toLowerCase().indexOf(needle, idx + 1)) !== -1) {
      hits.push({ needle, idx, context: html.slice(Math.max(0, idx - 220), Math.min(html.length, idx + 260)).replace(/\s+/g, ' ') });
      if (hits.length > 20) break;
    }
  }
  if (hits.length) {
    console.log('\n###', row.templates?.name, row.templates?.slug, row.version);
    for (const h of hits.slice(0, 6)) console.log('---', h.needle, '@', h.idx, '\n', h.context);
  }
}
