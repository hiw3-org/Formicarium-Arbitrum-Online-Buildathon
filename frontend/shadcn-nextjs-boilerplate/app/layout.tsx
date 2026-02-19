import SupabaseProvider from './supabase-provider';
import { PropsWithChildren } from 'react';
import '@/styles/globals.css';
import { ThemeProvider } from './theme-provider';
import { Anybody } from 'next/font/google';
import Navbar from "@/components/navbar/Navbar";
import {GlobalProvider} from "@/contexts/GlobalContext";

export const dynamic = 'force-dynamic';
const anybody = Anybody({ subsets: ['latin'], weight: ['400', '700'] });

export default function RootLayout({
  // Layouts must accept a children prop.
  // This will be populated with nested layouts or pages
  children
}: PropsWithChildren) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>
          Formicarium - Autonomous 3D Printing Service
        </title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* <!--  Social tags   --> */}
        <meta
          name="keywords"
          content="Add here your main keywords and separate them with a comma"
        />
        <meta name="description" content="Add here your website description" />
        {/* <!-- Schema.org markup for Google+ --> */}
        <meta itemProp="name" content="Add here your website name / title" />
        <meta
          itemProp="description"
          content="Add here your website description"
        />
        <meta
          itemProp="image"
          content="Add here the link for your website SEO image"
        />
        {/* <!-- Twitter Card data --> */}
        <meta name="twitter:card" content="product" />
        <meta
          name="twitter:title"
          content="Add here your website name / title"
        />
        <meta
          name="twitter:description"
          content="Add here your website description"
        />
        <meta
          name="twitter:image"
          content="Add here the link for your website SEO image"
        />
        {/* <!-- Open Graph data --> */}
        <meta
          property="og:title"
          content="Add here your website name / title"
        />
        <meta property="og:type" content="product" />
        <meta property="og:url" content="https://your-website.com" />
        <meta
          property="og:image"
          content="Add here the link for your website SEO image"
        />
        <meta
          property="og:description"
          content="Add here your website description"
        />
        <meta
          property="og:site_name"
          content="Add here your website name / title"
        />
        <link rel="canonical" href="https://your-website.com" />
        <link rel="icon" href="/img/favicon.ico" />
      </head>
      <body id={'root'} className={`${anybody.className} loading bg-white`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <GlobalProvider>
            <Navbar brandText="formicarium"/>
            {/* Service Status Banner */}
            <div className="fixed top-16 left-0 right-0 z-40 bg-yellow-500 text-black px-6 py-3 text-center font-semibold shadow-lg">
              ⚠️ Service Currently Offline - Our autonomous 3D printers require human supervision and cannot be left unattended. We apologize for the inconvenience.
            </div>
            {/* Background applied to all pages */}
            <div className="relative w-screen min-h-screen bg-repeat bg-top pt-28"
                 style={{backgroundImage: "url('/background.png')", backgroundSize: "auto"}}>

              {/* Dark Overlay */}
              <div className="absolute inset-0 bg-black opacity-60"></div>

              {/* Content needs to be relative to stay above overlay */}
              <main className="relative container mx-auto px-6 py-10">{children}</main>
            </div>
            </GlobalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
