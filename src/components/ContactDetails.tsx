import type { HostContact } from '../lib/rsvp-api';

export default function ContactDetails({ contacts, className = 'faq-contacts' }: { contacts: HostContact[]; className?: string }) {
  return (
    <div className={className}>
      {contacts.map((contact) => <p key={contact.name}><strong>{contact.name}</strong><br /><a href={`tel:${contact.phone}`}>{contact.phoneDisplay}</a><br /><a href={`mailto:${contact.email}`}>{contact.email}</a></p>)}
    </div>
  );
}
