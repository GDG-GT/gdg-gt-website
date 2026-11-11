#if DEBUG
  import Foundation
  /// In-memory, fictional data for simulator UI tests. This transport is absent from Release builds.
  @MainActor enum NativeFixtures {
    static var enabled: Bool { ProcessInfo.processInfo.arguments.contains("--ui-testing-native") }
    static let event = "a5100000-0000-4000-8000-000000000001",
      member = "a5100000-0000-4000-8000-000000000002",
      activity = "a5100000-0000-4000-8000-000000000003",
      form = "a5100000-0000-4000-8000-000000000004", task = "a5100000-0000-4000-8000-000000000005"
    static var scans: Set<String> = []
    static func json(_ value: Any) -> NativeJSON {
      try! JSONDecoder().decode(
        NativeJSON.self, from: JSONSerialization.data(withJSONObject: value))
    }
    static func response(_ path: String, method: String, body: NativeJSON?) async throws
      -> NativeJSON
    {
      let p = path.components(separatedBy: "?")[0]
      let today = ISO8601DateFormatter().string(from: Date())
      let person: [String: Any] = [
        "id": member, "name": "Alex Rivera", "email": "alex@example.test", "category": "organizer",
        "is_active": true, "is_core_team": true, "major": "Computer Science", "year": "Junior",
        "revision": 1, "actions": ["read", "update"], "interests": [],
        "team_section": "Active Members",
      ]
      let e: [String: Any] = [
        "id": event, "title": "Build Night", "location": "Technology Square",
        "description": "Build something with the chapter. Bring your ideas and meet the team.",
        "start_at": today, "end_at": today, "publication_status": "published", "revision": 1,
        "actions": ["update", "publish"],
      ]
      let f: [String: Any] = [
        "id": form, "title": "Project interest form", "status": "Open", "responseCount": 12,
        "revision": 1, "actions": ["edit", "view_responses"], "sections": [["id": "section-one"]],
        "fields": [
          [
            "id": "field-one", "label": "What would you like to build?", "type": "textarea",
            "sectionId": "section-one",
          ],
          [
            "id": "field-two", "label": "Preferred team", "type": "text",
            "sectionId": "section-one",
          ],
        ],
      ]
      let t: [String: Any] = [
        "id": task, "title": "Prepare the welcome desk",
        "description": "Bring the chapter cards and check the event registration list.",
        "priority": "high", "status": "pending", "revision": 1, "actions": ["status", "comment"],
        "due_date": "2026-11-20",
      ]
      if p == "/auth/session" {
        return json([
          "user": [
            "id": "a5100000-0000-4000-8000-000000000099", "email": "officer@example.test",
            "display_name": "Alex Rivera", "role": "super_admin",
          ], "csrfToken": "fixture",
        ])
      }
      if p == "/admin/access" {
        return json([
          "accessibleRoutes": [
            "/admin/events", "/admin/members", "/admin/forms", "/admin/communications",
            "/admin/newsletter",
          ]
        ])
      }
      if p == "/admin/dashboard" {
        return json([
          "widgets": [
            "events": ["data": ["items": [e]]],
            "activity": [
              "data": [
                "items": [["id": "recent-one", "action": "events.updated", "created_at": today]]
              ]
            ],
          ]
        ])
      }
      if p == "/admin/mobile/check-in" {
        if method == "GET" {
          return json([
            "activities": [
              [
                "id": activity, "title": "Build Night attendance", "points": 10,
                "opensAt": "2020-01-01T00:00:00Z", "closesAt": "2035-01-01T00:00:00Z",
              ]
            ], "events": [e], "connections": [],
          ])
        }
        let credential = body?["credential"].string ?? ""
        let duplicate = scans.contains(credential)
        scans.insert(credential)
        return json([
          "memberName": "Participant \(scans.count)",
          "status": duplicate ? "duplicate" : "checked_in", "points": duplicate ? 0 : 10,
        ])
      }
      if p == "/admin/events" {
        return json(["items": [e], "total": 1, "capabilities": ["globalCreate": true]])
      }
      if p == "/admin/events/" + event { return json(["event": e]) }
      if p == "/admin/events/" + event + "/attendees" {
        return json([
          "items": [
            [
              "id": member, "attendee_name": "Alex Rivera", "attendee_email": "alex@example.test",
              "attended": true,
            ]
          ], "total": 1,
        ])
      }
      if p == "/admin/members" { return json(["items": [person], "total": 1]) }
      if p == "/admin/members/" + member { return json(["member": person]) }
      if p == "/admin/rewards" {
        return json([
          "selectedMember": ["points": 120],
          "credentials": [
            [
              "id": "a5100000-0000-4000-8000-000000000006", "kind": "card", "label": "Chapter card",
              "bound": true,
            ]
          ],
          "ledger": [
            [
              "id": "points-one", "points": 10, "reason": "Build Night attendance",
              "created_at": today,
            ]
          ], "walletAvailable": true, "googleWalletAvailable": true,
        ])
      }
      if p == "/admin/forms" { return json(["items": [f], "total": 1]) }
      if p == "/admin/forms/" + form { return json(f) }
      if p == "/admin/forms/" + form + "/responses" {
        return json([
          "items": [
            [
              "id": "a5100000-0000-4000-8000-000000000007",
              "respondent": ["name": "Alex Rivera", "email": "alex@example.test"],
              "submittedAt": today, "version": 1,
              "answers": [
                "field-one": "A tool that helps students find project teams.",
                "field-two": "Mobile development",
              ], "status": "submitted",
            ]
          ], "total": 1,
        ])
      }
      if p == "/admin/communications/tasks" { return json(["items": [t], "total": 1]) }
      if p == "/admin/communications/tasks/" + task { return json(["record": t]) }
      if p == "/admin/communications/tasks/" + task + "/comments" {
        return json([
          "items": [
            [
              "id": "comment-one", "comment": "The cards are ready.", "authorName": "Alex Rivera",
              "created_at": today,
            ]
          ]
        ])
      }
      if p == "/admin/notifications" {
        return json([
          "items": [
            [
              "id": "a5100000-0000-4000-8000-000000000008", "title": "New form response",
              "message": "Alex submitted the project interest form.", "is_read": false,
              "created_at": today, "link": "/admin/forms/" + form,
            ]
          ], "total": 1, "unreadCount": 1,
        ])
      }
      if p == "/admin/app-notifications" {
        return json([
          "preferences": [
            "forms": true, "events": true, "newsletter": true, "accounts": true, "id": true,
            "contact": true, "workspace": true,
          ], "devices": [],
        ])
      }
      if p == "/admin/newsletter/capabilities" {
        return json(["chapterRead": true, "chapterCreate": true, "chapterSend": true, "teams": []])
      }
      if p == "/admin/newsletter/subscribers" {
        return json([
          "items": [
            [
              "id": member, "name": "Alex Rivera", "email": "alex@example.test", "state": "active",
              "revision": 1, "actions": ["update"],
            ]
          ], "total": 1,
        ])
      }
      if p == "/admin/newsletter/campaigns" {
        return json([
          "items": [
            [
              "id": event, "subject": "This week at GDG",
              "content": "Build Night is coming up. See you there!", "status": "draft",
              "revision": 1, "audience": "all", "recipientIds": [],
              "actions": ["update", "send_email"],
            ]
          ], "total": 1,
        ])
      }
      if p == "/admin/newsletter/campaigns/" + event {
        return json([
          "record": [
            "id": event, "subject": "This week at GDG",
            "content": "Build Night is coming up. See you there!", "status": "draft", "revision": 1,
            "audience": "all", "recipientIds": [], "actions": ["update", "send_email"],
          ]
        ])
      }
      if p == "/admin/newsletter/templates" { return json(["items": [], "total": 0]) }
      if p == "/admin/me" {
        return json([
          "profile": [
            "name": "Alex Rivera", "role": "Chapter organizer",
            "bio": "Building with the community.",
            "linkedin_url": "https://linkedin.com/in/example",
            "github_url": "https://github.com/example", "portfolio_url": "https://example.test",
          ]
        ])
      }
      if method != "GET" { return json(["success": true]) }
      throw NativeAPIError(
        status: 404, code: "FIXTURE_MISSING", message: "Simulator fixture missing.", fields: .null)
    }
  }
#endif
