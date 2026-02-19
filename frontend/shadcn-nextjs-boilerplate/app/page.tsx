import { redirect } from 'next/navigation';

export default async function Dashboard() {
  // Redirect directly to chat page on load
  redirect('/dashboard/chat');
}