import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://seeazhrbnjsdnbmdsgfp.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZWF6aHJibmpzZG5ibWRzZ2ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxODUzOTMsImV4cCI6MjA5ODc2MTM5M30.WlQiiys5ladMGaa6eyyB55oDP2mlU4yQz0daBESuZzM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
