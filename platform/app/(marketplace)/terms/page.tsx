import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service - Terminal AI',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-slate-900 mb-3">{title}</h2>
      <div className="text-sm text-slate-600 space-y-2">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="font-display text-4xl font-bold text-foreground">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 2 April 2025</p>
      </div>

      <Section title="1. Introduction">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Terminal AI,
          a platform operated by Studio Ionique (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or
          &ldquo;our&rdquo;), a company registered in India. By creating an account or using
          Terminal AI in any way, you agree to be bound by these Terms.
        </p>
        <p>
          If you do not agree to these Terms, please do not use the platform.
        </p>
      </Section>

      <Section title="2. Account Registration">
        <p>
          You must be at least 13 years old to create an account. You are responsible for
          maintaining the confidentiality of your login credentials and for all activity that
          occurs under your account.
        </p>
        <p>
          You agree to provide accurate and complete information when registering and to keep
          that information up to date. We reserve the right to suspend or terminate accounts
          that contain false or misleading information.
        </p>
      </Section>

      <Section title="3. Credits &amp; Payments">
        <p>
          Terminal AI operates on a credit-based system. Credits are purchased in advance and
          consumed when you run AI applications on the platform.
        </p>
        <p>
          Credits are <strong>non-transferable</strong> and may not be sold, gifted, or
          otherwise transferred to another account. Subscription plans auto-renew monthly on
          the anniversary of your subscription date unless cancelled before the renewal date.
        </p>
        <p>
          All payments are processed securely via Razorpay. Prices are listed in INR unless
          otherwise stated. Applicable taxes may be added at checkout in accordance with Indian
          GST regulations.
        </p>
      </Section>

      <Section title="4. Refund Policy">
        <p>
          Refund requests for unused credit packs must be submitted within <strong>7 days</strong>{' '}
          of purchase by emailing{' '}
          <a href="mailto:support@studioionique.com" className="text-orange-500 hover:underline">
            support@studioionique.com
          </a>{' '}
          with your order details.
        </p>
        <p>
          Credits that have already been consumed are not eligible for a refund. Subscription
          fees for a billing period that has already commenced are non-refundable. We reserve
          the right to decline refund requests that we reasonably believe are fraudulent or
          abusive.
        </p>
      </Section>

      <Section title="5. Acceptable Use">
        <p>You agree not to use Terminal AI to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Generate, distribute, or promote illegal, harmful, or abusive content.</li>
          <li>Violate any applicable law or regulation.</li>
          <li>Infringe the intellectual property rights of any third party.</li>
          <li>Attempt to reverse-engineer, scrape, or otherwise misuse the platform.</li>
          <li>Engage in automated access or data harvesting without our prior written consent.</li>
          <li>Impersonate another person or entity.</li>
        </ul>
        <p>
          We reserve the right to suspend or terminate accounts that violate these guidelines,
          with or without prior notice.
        </p>
      </Section>

      <Section title="6. Creator Terms">
        <p>
          If you publish AI applications (&ldquo;apps&rdquo;) on the Terminal AI marketplace,
          you grant us a non-exclusive, worldwide, royalty-free licence to host, display, and
          distribute your app to users of the platform.
        </p>
        <p>
          Creators receive a <strong>50% revenue share</strong> on net credits consumed by
          users of their apps, calculated and paid out monthly. We reserve the right to adjust
          the revenue share with 30 days&apos; notice.
        </p>
        <p>
          You are solely responsible for ensuring your app complies with all applicable laws
          and does not violate third-party rights. We may remove any app at our discretion.
        </p>
      </Section>

      <Section title="7. Intellectual Property">
        <p>
          All content, trademarks, and technology on Terminal AI are the property of Studio
          Ionique or its licensors. Nothing in these Terms transfers any intellectual property
          rights to you.
        </p>
        <p>
          You retain ownership of any content you create or upload. By submitting content to
          the platform you represent that you have the rights to do so.
        </p>
      </Section>

      <Section title="8. Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, Studio Ionique shall not be liable
          for any indirect, incidental, special, consequential, or punitive damages, including
          but not limited to loss of profits, data, or goodwill, arising from your use of or
          inability to use Terminal AI.
        </p>
        <p>
          Our total aggregate liability to you for any claims arising under these Terms shall
          not exceed the amount you paid to us in the three months preceding the claim.
        </p>
      </Section>

      <Section title="9. Termination">
        <p>
          You may delete your account at any time from your account settings. Upon termination,
          your right to use the platform ceases immediately and any unused credits are forfeited.
        </p>
        <p>
          We may terminate or suspend your account at our discretion, including for violation
          of these Terms, with or without notice.
        </p>
      </Section>

      <Section title="10. Governing Law">
        <p>
          These Terms are governed by and construed in accordance with the laws of India. Any
          disputes arising from these Terms shall be subject to the exclusive jurisdiction of
          the courts located in India.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          If you have any questions about these Terms, please contact us at{' '}
          <a href="mailto:support@studioionique.com" className="text-orange-500 hover:underline">
            support@studioionique.com
          </a>
          .
        </p>
        <p>Studio Ionique, India.</p>
      </Section>
    </div>
  )
}
