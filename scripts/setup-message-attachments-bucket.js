/**
 * Script to create the message-attachments bucket in Supabase Storage
 * Run this once to set up file uploads for the messaging system
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY // You need the service role key for this

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables!')
  console.error('Make sure you have:')
  console.error('  - NEXT_PUBLIC_SUPABASE_URL in .env.local')
  console.error('  - SUPABASE_SERVICE_ROLE_KEY in .env.local')
  console.error('\nYou can find the service role key in:')
  console.error('Supabase Dashboard > Settings > API > service_role key')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupMessageAttachmentsBucket() {
  console.log('🔧 Setting up message-attachments bucket...\n')

  try {
    // Check if bucket already exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    
    if (listError) {
      console.error('❌ Error listing buckets:', listError.message)
      process.exit(1)
    }

    const bucketExists = buckets.some(bucket => bucket.name === 'message-attachments')

    if (bucketExists) {
      console.log('✅ Bucket "message-attachments" already exists!')
    } else {
      // Create the bucket
      const { data, error } = await supabase.storage.createBucket('message-attachments', {
        public: false, // Private bucket
        fileSizeLimit: 10485760, // 10MB limit
        allowedMimeTypes: [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain'
        ]
      })

      if (error) {
        console.error('❌ Error creating bucket:', error.message)
        process.exit(1)
      }

      console.log('✅ Created bucket "message-attachments" successfully!')
    }

    console.log('\n📋 Next steps:')
    console.log('1. Go to Supabase Dashboard > Storage > message-attachments')
    console.log('2. Click on "Policies" tab')
    console.log('3. Add the following policies:\n')
    
    console.log('Policy 1: Allow users to upload files')
    console.log('----------------------------------------')
    console.log('CREATE POLICY "Users can upload message attachments"')
    console.log('ON storage.objects FOR INSERT')
    console.log('TO authenticated')
    console.log('WITH CHECK (')
    console.log('  bucket_id = \'message-attachments\' AND')
    console.log('  auth.uid()::text = (storage.foldername(name))[1]')
    console.log(');')
    console.log('')
    
    console.log('Policy 2: Allow users to view their files')
    console.log('----------------------------------------')
    console.log('CREATE POLICY "Users can view message attachments"')
    console.log('ON storage.objects FOR SELECT')
    console.log('TO authenticated')
    console.log('USING (')
    console.log('  bucket_id = \'message-attachments\' AND')
    console.log('  auth.uid()::text = (storage.foldername(name))[1]')
    console.log(');')
    console.log('')
    
    console.log('Policy 3: Allow users to delete their files')
    console.log('----------------------------------------')
    console.log('CREATE POLICY "Users can delete their message attachments"')
    console.log('ON storage.objects FOR DELETE')
    console.log('TO authenticated')
    console.log('USING (')
    console.log('  bucket_id = \'message-attachments\' AND')
    console.log('  auth.uid()::text = (storage.foldername(name))[1]')
    console.log(');')
    
    console.log('\n✨ Setup complete! You can now upload files in messages.')

  } catch (err) {
    console.error('❌ Unexpected error:', err)
    process.exit(1)
  }
}

setupMessageAttachmentsBucket()
