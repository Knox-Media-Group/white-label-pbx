# KLT Connect - Project TODO

## Core Architecture
- [x] Multi-tenant database schema with customer isolation
- [x] Customer table with Telnyx integration
- [x] SIP endpoints table with call handler configuration
- [x] Phone numbers table with assignment tracking
- [x] Ring groups table with member management
- [x] Call routes table with pattern matching
- [x] Usage statistics table for tracking
- [x] Call recordings table with S3 metadata
- [x] Branding settings table per customer
- [x] Retell AI agents table

## Admin Dashboard
- [x] Admin authentication and role-based access
- [x] Customer list with search and filtering
- [x] Customer creation and management
- [x] Global usage statistics overview
- [x] Customer usage breakdown
- [x] Global settings configuration (Telnyx + Retell)
- [x] Phone number search, purchase, and release
- [x] SIP endpoint management
- [x] Retell AI agent management
- [x] Number porting workflow
- [x] Viirtue import tool
- [x] SMS sending from phone numbers

## Customer Portal
- [x] Customer login system (separate from admin)
- [x] Customer dashboard with overview stats
- [x] SIP endpoint management interface
- [x] Phone number management interface
- [x] Ring group configuration interface
- [x] Call routing rules interface
- [x] Branding customization interface
- [x] Call recordings playback interface

## Telnyx Integration
- [x] Telnyx API client setup (v2 REST API)
- [x] SIP credential provisioning
- [x] Phone number search and purchase
- [x] Phone number assignment to connections
- [x] TeXML webhook for inbound call routing
- [x] TeXML response generation for call flows
- [x] SMS send/receive via messaging API
- [x] Call recording webhooks
- [x] Number porting (portability check, create, update, confirm)
- [x] Document upload for porting (LOA/invoice)

## Retell AI Integration
- [x] Retell AI API client (agents, phone numbers, calls)
- [x] Agent creation and management
- [x] Phone number import to Retell
- [x] Webhook handler for call events (started, ended, analyzed)
- [x] Call transcript and summary storage
- [x] Webhook signature verification

## SIP Endpoint Management
- [x] Create SIP credentials on Telnyx
- [x] Configure call handler (TeXML, Call Control, AI Agent)
- [x] Set caller ID and display name
- [x] Extension number assignment
- [x] Status management (active/inactive)

## Phone Number Management
- [x] Search available phone numbers (local + toll-free)
- [x] Purchase phone numbers via Telnyx
- [x] Assign to SIP endpoint or ring group
- [x] Configure voice/SMS/fax capabilities
- [x] Release phone numbers
- [x] SMS sending from owned numbers

## Ring Groups
- [x] Create ring groups with name and extension
- [x] Add/remove member endpoints
- [x] Configure ring strategy (simultaneous, sequential, round-robin, random)
- [x] Set ring timeout
- [x] Configure failover action (voicemail, forward, hangup)

## Call Routing
- [x] Create routing rules with priority
- [x] Pattern matching (caller ID, DID, all)
- [x] Time-based routing (start/end time, days of week)
- [x] Destination types (endpoint, ring group, external, voicemail, AI agent)
- [x] Rule activation/deactivation
- [x] AI-powered IVR with speech recognition

## Custom Branding
- [x] Logo upload and storage in S3
- [x] Primary color customization
- [x] Company name customization
- [x] Apply branding to customer portal
- [x] Preview branding changes

## Webhooks
- [x] Voice webhook (inbound call routing)
- [x] Call status webhook (usage tracking)
- [x] Recording webhook (recording storage + SMS summary)
- [x] Voicemail webhook
- [x] Missed call webhook
- [x] AI IVR gather webhook (speech processing)
- [x] AI IVR fallback webhook
- [x] Retell AI webhook (call lifecycle events)

## Number Porting
- [x] Portability check
- [x] Create draft port orders
- [x] Submit to Telnyx (3-step: create draft, update details, confirm)
- [x] Document upload (LOA + invoice)
- [x] Status sync from Telnyx
- [x] Cancel port orders
- [x] Port order tracking UI

## SMS Call Summary Feature
- [x] SMS sending via Telnyx messaging API
- [x] LLM-powered call summary generator
- [x] SMS summary on call completion webhook
- [x] Customer settings for enabling/disabling SMS summaries
- [x] UI toggle for SMS summary preferences

## Notifications
- [x] Missed call notifications
- [x] Voicemail notifications
- [x] High call volume alerts
- [x] Recording ready notifications
- [x] In-app notification system
