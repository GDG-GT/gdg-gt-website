import XCTest

final class NativeWorkspaceUITests: XCTestCase {
  var app: XCUIApplication!
  override func setUpWithError() throws {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments = ["--ui-testing-native"]
    app.launch()
    XCTAssertTrue(app.buttons["Open check-in scanner"].waitForExistence(timeout: 20))
  }
  func testNativeNavigationAndRecords() {
    app.tabBars.buttons["Events"].tap()
    XCTAssertTrue(app.staticTexts["Build Night"].waitForExistence(timeout: 5))
    app.staticTexts["Build Night"].firstMatch.tap()
    XCTAssertTrue(app.staticTexts["Technology Square"].waitForExistence(timeout: 5))
    app.tabBars.buttons["Members"].tap()
    XCTAssertTrue(app.staticTexts["Alex Rivera"].waitForExistence(timeout: 5))
    app.staticTexts["Alex Rivera"].firstMatch.tap()
    XCTAssertTrue(app.buttons["Issue card or Wallet pass"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Chapter card"].exists)
    app.tabBars.buttons["Home"].tap()
    app.buttons["Forms & responses"].tap()
    XCTAssertTrue(app.staticTexts["Project interest form"].waitForExistence(timeout: 5))
    app.staticTexts["Project interest form"].tap()
    XCTAssertTrue(app.staticTexts["Alex Rivera"].waitForExistence(timeout: 5))
    app.staticTexts["Alex Rivera"].firstMatch.tap()
    XCTAssertTrue(
      app.staticTexts["A tool that helps students find project teams."].waitForExistence(timeout: 5)
    )
    app.tabBars.buttons["More"].tap()
    app.buttons["Tasks"].tap()
    XCTAssertTrue(app.staticTexts["Prepare the welcome desk"].waitForExistence(timeout: 5))
    app.staticTexts["Prepare the welcome desk"].tap()
    XCTAssertTrue(app.staticTexts["The cards are ready."].waitForExistence(timeout: 5))
    XCTAssertEqual(app.webViews.count, 0)
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "Native task detail"
    attachment.lifetime = .keepAlways
    add(attachment)
  }
  func testNativeNewsletterInvitationAndAudience() {
    app.tabBars.buttons["More"].tap()
    app.buttons["Newsletter"].tap()
    XCTAssertTrue(app.staticTexts["This week at GDG"].waitForExistence(timeout: 5))
    app.segmentedControls.buttons["Subscribers"].tap()
    XCTAssertTrue(app.staticTexts["alex@example.test"].waitForExistence(timeout: 5))
    app.buttons["Invite subscriber"].tap()
    XCTAssertTrue(
      app.staticTexts["We’ll send a welcome invitation with a Join the newsletter button."]
        .waitForExistence(timeout: 5))
    XCTAssertEqual(app.webViews.count, 0)
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "Native newsletter invitation"
    attachment.lifetime = .keepAlways
    add(attachment)
  }
  func testDraftSurvivesBackgroundBehindPrivacyShield() {
    app.tabBars.buttons["Members"].tap()
    XCTAssertTrue(app.buttons["New member"].waitForExistence(timeout: 5))
    app.buttons["New member"].tap()
    let name = app.textFields["Full name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Draft kept")
    XCUIDevice.shared.press(.home)
    app.activate()
    XCTAssertTrue(name.waitForExistence(timeout: 10))
    XCTAssertEqual(name.value as? String, "Draft kept")
    XCTAssertEqual(app.webViews.count, 0)
  }
  func testContinuousCheckinAndDuplicateFeedback() {
    app.tabBars.buttons["Check-in"].tap()
    app.buttons["Choose activity or event"].tap()
    XCTAssertTrue(app.staticTexts["Build Night attendance"].waitForExistence(timeout: 5))
    app.staticTexts["Build Night attendance"].tap()
    let next = app.buttons["simulate-next"]
    if !next.isHittable { app.swipeUp() }
    XCTAssertTrue(next.waitForExistence(timeout: 5))
    for _ in 0..<3 { next.tap() }
    XCTAssertTrue(app.staticTexts["Participant 3"].waitForExistence(timeout: 5))
    sleep(3)
    app.buttons["simulate-duplicate"].tap()
    XCTAssertTrue(app.staticTexts["Already checked in"].firstMatch.waitForExistence(timeout: 5))
    XCTAssertEqual(app.webViews.count, 0)
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "Native continuous check-in"
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
