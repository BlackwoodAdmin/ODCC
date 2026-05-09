import React from 'react';
import { Link } from 'react-router-dom';

export default function OurPastor() {
  return (
    <div>
      <section className="relative py-24 bg-charcoal text-white">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold mb-4">Meet Our Minister</h1>
          <p className="text-xl text-gray-300">Pastor Stephen Presley</p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-xl overflow-hidden shadow-lg mb-12">
              <img
                src="/our-pastor.webp"
                alt="Pastor Stephen Presley"
                className="w-full h-auto"
                loading="eager"
              />
            </div>
            <p className="text-xl leading-relaxed text-gray-600 text-center max-w-3xl mx-auto">
              Stephen Presley serves as pastor of Open Door Christian Church in DeLand, Florida —
              a calling that, in a real sense, has been forty years in the making.
            </p>
          </div>
        </div>
      </section>

      <section className="section-padding bg-cream">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-charcoal mb-4">Roots in This Community</h2>
              <div className="w-20 h-1 bg-sage mx-auto"></div>
            </div>
            <div className="prose prose-lg max-w-none text-gray-600">
              <p className="leading-relaxed mb-6">
                Steve moved to Volusia County in 1966 when his father Charles Presley was called
                to serve Plymouth Avenue Christian Church, where Steve attended growing up. As a
                young man Steve went on to help his father plant Open Door Christian Church four
                decades ago. In those early days, Steve's contribution was practical rather than
                spiritual. He helped build the church out of love for his father before he had a
                faith of his own. The Lord, as Steve often puts it, was patient.
              </p>
              <p className="leading-relaxed">
                His family's ministry roots in this region run deep. His great-grandfather Cicero
                served in the Restoration Movement tradition at Pleasant Hill Christian Church,
                his father Charles was ordained at the same church in 1950, and his great aunts
                Ruby and Grace served alongside that congregation as well. A brother and a dozen
                first cousins have served as ministers, Bible college presidents, and professors from
                Cincinnati to Florida. Steve's own ordination on Easter Sunday 2026 was at The
                Christian Church at DeLeon Springs, where he has been a member for twenty years.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-charcoal mb-4">A Life Shaped for This Work</h2>
              <div className="w-20 h-1 bg-sage mx-auto"></div>
            </div>
            <div className="prose prose-lg max-w-none text-gray-600">
              <p className="leading-relaxed mb-6">
                Before stepping into pastoral ministry, Steve built a varied and faithful working
                life. He served four years in the United States Navy as an Aviation Electronics
                Technician, holding a Secret clearance and completing advanced technical training
                in avionics and electrical systems. After the Navy, he worked as a Customer
                Service Engineer for Xerox Corporation, diagnosing and repairing complex
                electromechanical systems and supporting customers across his service territory.
              </p>
              <p className="leading-relaxed">
                In 1992, Steve founded Southern Air Inc., an HVAC and mechanical services
                business he owned and operated for fifteen years, growing it through reputation
                and consistent service. In 2007, he transitioned into software engineering with
                Blackwood Productions Inc., where he continues to design and maintain web
                applications and server infrastructure. A tenth-grade computer programming class
                — the first offered in Volusia County — planted a seed that lay dormant for more
                than twenty years before bearing fruit in his current technical work, which now
                includes maintaining the website and digital ministry tools for Open Door itself.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding bg-cream">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-charcoal mb-4">Pastoral Approach</h2>
              <div className="w-20 h-1 bg-sage mx-auto"></div>
            </div>
            <div className="prose prose-lg max-w-none text-gray-600">
              <p className="leading-relaxed">
                Steve preaches from the New International Version, writes full sermon
                manuscripts, and favors a story-driven style with pastoral warmth. He believes
                the pulpit is for proclaiming the Word, not for performance, and that the work
                of a small congregation is exactly the kind of work the Kingdom remembers.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-charcoal mb-4">Personal</h2>
              <div className="w-20 h-1 bg-sage mx-auto"></div>
            </div>
            <div className="prose prose-lg max-w-none text-gray-600">
              <p className="leading-relaxed">
                Steve lives in Orange City, Florida, and has deep ties throughout Volusia
                County. His career has carried him from naval aviation to small business
                ownership to software engineering, but his life's center has come to rest where,
                in hindsight, it was always headed: the pulpit of Open Door Christian Church.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding bg-sage text-white">
        <div className="container-custom">
          <div className="max-w-3xl mx-auto text-center">
            <blockquote className="text-3xl md:text-4xl font-serif italic leading-relaxed mb-6">
              &ldquo;Consecrate yourselves, for tomorrow the Lord will do amazing things among
              you.&rdquo;
            </blockquote>
            <cite className="text-lg not-italic opacity-90">— Joshua 3:5</cite>
          </div>
        </div>
      </section>

      <section className="section-padding bg-cream text-center">
        <div className="container-custom">
          <h2 className="text-4xl font-bold text-charcoal mb-6">Reach Out</h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            We'd love to hear from you. Reach out to Pastor Steve or visit us this Sunday.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/contact"
              className="bg-sage text-white px-8 py-4 rounded-lg font-semibold hover:bg-sage/90 transition-colors text-lg"
            >
              Contact Us
            </Link>
            <Link
              to="/services"
              className="border-2 border-sage text-sage px-8 py-4 rounded-lg font-semibold hover:bg-sage hover:text-white transition-colors text-lg"
            >
              Service Times
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
