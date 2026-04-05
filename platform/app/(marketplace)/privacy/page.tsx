import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy - Terminal AI',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-slate-900 mb-3">{title}</h2>
      <div className="text-sm text-slate-600 space-y-2">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="font-display text-4xl font-bold text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 2 April 2025</p>
      </div>

      <Section title="1. Data Controller">
        <p>
          Terminal AI is operated by Studio Ionique, a company registered in India
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;). We are the data
          controller for personal data collected through the platform. For any privacy-related
          queries, contact us at{' '}
          <a href="mailto:support@studioionique.com" className="text-orange-500 hover:underline">
            support@studioionique.com
          </a>
          .
        </p>
      </Section>

      <Section title="2. Data We Collect">
        <p>We collect the following categories of personal data:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Account data:</strong> name, email address, and hashed password when you
            register.
          </li>
          <li>
            <strong>Usage data:</strong> AI app interactions, credit consumption, and session
            metadata.
          </li>
          <li>
            <strong>Payment data:</strong> billing name and transaction identifiers. Payment
            card details are processed directly by Razorpay and are <strong>never</strong>{' '}
            stored on our servers.
          </li>
          <li>
            <strong>Technical data:</strong> IP address, browser type, and device information
            collected automatically via server logs.
          </li>
          <li>
            <strong>Communications:</strong> any messages you send to our support team.
          </li>
        </ul>
      </Section>

      <Section title="3. How We Use Your Data">
        <p>We use your personal data to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Provide, operate, and improve the Terminal AI platform.</li>
          <li>Process payments and manage your credit balance.</li>
          <li>Send transactional emails (receipts, password resets, account alerts).</li>
          <li>Respond to support requests.</li>
          <li>Detect and prevent fraud or abuse.</li>
          <li>Comply with applicable legal obligations.</li>
        </ul>
      </Section>

      <Section title="4. Legal Basis (GDPR)">
        <p>
          Where the GDPR or equivalent data protection law applies, we process your personal
          data under the following legal bases:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Contract performance:</strong> processing necessary to fulfil your account
            and subscription.
          </li>
          <li>
            <strong>Legitimate interests:</strong> fraud prevention, security, and platform
            improvement.
          </li>
          <li>
            <strong>Legal obligation:</strong> compliance with tax and regulatory requirements.
          </li>
          <li>
            <strong>Consent:</strong> where we ask for your explicit consent for optional
            communications.
          </li>
        </ul>
      </Section>

      <Section title="5. Data Sharing">
        <p>
          We do not sell your personal data. We share data only with the following categories
          of service providers under appropriate data processing agreements:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Razorpay</strong> -payment processing. Their privacy policy governs card
            data.
          </li>
          <li>
            <strong>OpenRouter</strong> -AI model routing. Prompts and responses may be
            transmitted to third-party AI model providers via OpenRouter.
          </li>
          <li>
            <strong>Cloud infrastructure providers</strong> -hosting and database services.
          </li>
        </ul>
        <p>
          We may also disclose data when required by law or to protect the rights and safety
          of our users and the public.
        </p>
      </Section>

      <Section title="6. Data Retention">
        <p>
          We retain your account data for as long as your account is active, plus a reasonable
          period thereafter to comply with legal obligations. Usage logs are retained for up to
          12 months. You may request deletion of your account and associated data at any time
          by contacting us.
        </p>
      </Section>

      <Section title="7. Your Rights">
        <p>
          Depending on your jurisdiction, you may have the following rights regarding your
          personal data:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Right of access -obtain a copy of your data.</li>
          <li>Right of rectification -correct inaccurate data.</li>
          <li>Right of erasure -request deletion of your data.</li>
          <li>Right to data portability -receive your data in a structured format.</li>
          <li>Right to object -object to certain types of processing.</li>
          <li>Right to restrict processing -limit how we use your data.</li>
        </ul>
        <p>
          To exercise any of these rights, email{' '}
          <a href="mailto:support@studioionique.com" className="text-orange-500 hover:underline">
            support@studioionique.com
          </a>
          . We will respond within 30 days.
        </p>
      </Section>

      <Section title="8. Cookies">
        <p>
          We use only <strong>essential cookies</strong> necessary for the platform to function
          (for example, session authentication). We do not use third-party tracking cookies or
          advertising cookies. No cookie consent banner is displayed because no non-essential
          cookies are set.
        </p>
      </Section>

      <Section title="9. Security">
        <p>
          We implement industry-standard technical and organisational measures to protect your
          personal data, including encryption in transit (TLS) and at rest, access controls,
          and regular security reviews. However, no system is completely secure, and we cannot
          guarantee absolute security.
        </p>
      </Section>

      <Section title="10. International Transfers">
        <p>
          Terminal AI is operated from India. If you access the platform from outside India,
          your data may be transferred to and processed in India or other countries where our
          service providers operate. By using the platform you consent to such transfers.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          For any questions, concerns, or requests relating to this Privacy Policy, please
          contact our privacy team at{' '}
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
