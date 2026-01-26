# White Label PBX Manager - Project TODO

## Core Architecture
- [x] Multi-tenant database schema with customer isolation
- [x] Customer table with SignalWire subproject integration
- [x] SIP endpoints table with call handler configuration
- [x] Phone numbers table with assignment tracking
- [x] Ring groups table with member management
- [x] Call routes table with pattern matching
- [x] Usage statistics table for tracking
- [x] Call recordings table with S3 metadata
- [x] Branding settings table per customer

## Admin Dashboard
- [x] Admin authentication and role-based access
- [x] Customer list with search and filtering
- [x] Customer creation and management
- [x] Global usage statistics overview
- [x] Customer usage breakdown
- [x] Global settings configuration

## Customer Portal
- [x] Customer login system (separate from admin)
- [x] Customer dashboard with overview stats
- [x] SIP endpoint management interface
- [x] Phone number management interface
- [x] Ring group configuration interface
- [x] Call routing rules interface
- [x] Branding customization interface
- [x] Call recordings playback interface

## SignalWire Integration
- [x] SignalWire API client setup
- [x] Subproject creation for new customers
- [x] SIP endpoint provisioning API
- [x] Phone number search and purchase API
- [x] Phone number assignment to endpoints
- [x] Webhook endpoint for call events
- [x] LaML response generation for call flows

## SIP Endpoint Management
- [x] Create SIP endpoint with SignalWire
- [x] Configure call handler (LaML, Relay, AI Agent)
- [x] Set caller ID and display name
- [x] Extension number assignment
- [x] Status management (active/inactive)

## Phone Number Management
- [x] Search available phone numbers
- [x] Purchase phone numbers via SignalWire
- [x] Assign to SIP endpoint or ring group
- [x] Configure voice/SMS/fax capabilities
- [x] Release phone numbers

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

## White-Label Branding
- [x] Logo upload and storage in S3
- [x] Primary color customization
- [x] Company name customization
- [x] Apply branding to customer portal
- [x] Preview branding changes

## Usage Monitoring
- [x] Track call volumes per customer
- [x] Track inbound/outbound calls
- [x] Track total minutes
- [x] Track active endpoints count
- [x] Track active phone numbers count
- [x] Historical usage charts

## Notifications
- [x] Missed call notifications
- [x] Voicemail notifications
- [x] High call volume alerts
- [x] Email notification delivery
- [x] In-app notification system

## LLM Capabilities
- [x] Intelligent call routing suggestions
- [x] Automated call summaries
- [x] Natural language configuration for call flows
- [x] AI-powered call analytics

## Call Recordings
- [x] S3 storage integration for recordings
- [x] Recording metadata tracking
- [x] Playback interface with controls
- [x] Retention policy management
- [x] Recording search and filtering

## Bug Fixes
- [ ] Fix customer status stuck on 'pending' - should be 'active' after creation
- [x] Fix AI call handling not transferring calls when caller asks for sales/departments

## SMS Call Summary Feature
- [x] Add SMS sending function to SignalWire API client
- [x] Create LLM-powered call summary generator
- [x] Integrate SMS summary into call completion webhook
- [x] Add customer settings for enabling/disabling SMS summaries
- [x] Add UI toggle for SMS summary preferences

## Bug Fixes - AI Agent Transfer
- [x] Fix AI Agent not transferring calls when caller asks for sales/departments
- [x] Investigate SignalWire Call Flow Builder AI Agent configuration (SWAIG is read-only)
- [x] Create webhook endpoint for AI Agent SWAIG transfer function
- [x] Return proper SWML with transfer action from webhook
- [x] Provide user with AI Agent configuration instructions
