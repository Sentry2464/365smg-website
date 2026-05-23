import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Stats } from "@/components/Stats";
import { Services } from "@/components/Services";
import { About } from "@/components/About";
import { Government } from "@/components/Government";
import { Academy } from "@/components/Academy";
import { Testimonials } from "@/components/Testimonials";
import { Careers } from "@/components/Careers";
import { Contact } from "@/components/Contact";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <Stats />
      <Services />
      <About />
      <Government />
      <Academy />
      <Testimonials />
      <Careers />
      <Contact />
      <Footer />
    </main>
  );
}
