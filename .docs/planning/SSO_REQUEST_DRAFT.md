# Georgia Tech SSO request draft

Historical request reference. The owner confirmed submitting the institutional request. These are the shortened answers reviewed in the form before submission; an approved provider configuration has not yet been supplied.

## Application Name

GDG at Georgia Tech

## Application Description

This is our GDG chapter website for events, resources, membership and club forms. We want students to sign in with their GT account through Supabase Auth and use it to verify form submissions.

## Application SSO Documentation Link

https://supabase.com/docs/guides/auth/custom-oauth-providers

## Application Vendor

Supabase Auth

## Application Vendor Contact Email

support@supabase.com

## Authorized Users

Georgia Tech students, chapter officers and our faculty and staff advisers. Anyone can view the public pages without signing in.

## Application-Owning Organization

GDG at Georgia Tech. Our chapter email is gdg@gatech.edu and our faculty sponsor is Mark Moss.

## Business Contact

gdg@gatech.edu

## Technical Contact

tejas.singhal@gatech.edu

## Data audience

Members can see their own account details. Chapter officers can review membership records and form responses. Supabase processes sign-in and stores our data. Vercel hosts the website and Resend handles email.

## Data storage and retention

Data is stored in Supabase in the US and the website is hosted on Vercel. Executive board applications are kept for 180 days. Other forms normally use 365 days, depending on their settings. Retention for the new SSO accounts will be confirmed before we enable sign-in.

## Existing Application

The website is already live at https://gdggt.dev. This is a new GT SSO integration using Supabase Auth.

## Other Primary User Identifier

The GT OIDC subject identifier and issuer, linked to a Supabase Auth user ID.

## Describe Username Format

The OIDC subject identifier provided by GT. We also need the student's name and verified GT email.

## Additional Information

We plan to connect GT to Supabase Auth using its OIDC provider option. We need the GT issuer URL and client registration details. We will confirm the callback URL from Supabase during setup.

## Other selections

Protocol OIDC. Faculty sponsor Mark Moss. Primary User Identifier Other. Username/nameid Format Other. Consent panel Yes.

FERPA-confidential access is currently No. Waiting for the chapter owner's decision on whether to include students with confidentiality flags and request Data Governance review.

The exact provider callback URL must be copied from the Supabase provider setup screen before registering it with GT. It has not been verified yet.
