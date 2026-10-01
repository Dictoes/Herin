import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {createHandler} from './handler.ts';

Deno.serve(createHandler({createClient}));
