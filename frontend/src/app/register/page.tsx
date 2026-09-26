import { redirect } from 'next/navigation';

// Accounts are created by signing in with Google; kept so old /register
// links still land somewhere useful.
export default function Page() {
  redirect('/login');
}
