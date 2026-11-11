// Offline API compatibility surface only. No implementation or network access.
// SDK API types come from the installed package; pinned remote 2.49.0 still
// requires its own native Deno validation before deployment.
declare module 'https://esm.sh/@supabase/supabase-js@2.49.0' {
  export { createClient } from '@supabase/supabase-js';
}
declare const Deno: {
  env: {get(name:string):string|undefined};
  serve(handler:(request:Request)=>Response|Promise<Response>):void;
};
