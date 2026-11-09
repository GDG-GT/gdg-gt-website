package dev.gdggt.workspace;

import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.*;
import static org.junit.Assert.*;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Launches only the chapter app; no fixture login or production data is created. */
@RunWith(AndroidJUnit4.class)
public class WorkspaceLaunchTest {
  @Test
  public void nativeSignInLaunchesAndChecksBlankFields() throws Exception {
    try (ActivityScenario<WorkspaceActivity> scenario =
        ActivityScenario.launch(WorkspaceActivity.class)) {
      onView(withText("Chapter workspace")).check(matches(isDisplayed()));
      onView(withText("Email")).check(matches(isDisplayed()));
      onView(withText("Remember with biometrics")).check(matches(isDisplayed()));
      onView(withText("Sign in")).perform(click());
      onView(withText("Enter your access code, email and password.")).check(matches(isDisplayed()));
      scenario.onActivity(activity -> assertFalse(activity.isFinishing()));
      var instrumentation = InstrumentationRegistry.getInstrumentation();
      var screenshot = instrumentation.getUiAutomation().takeScreenshot();
      assertNotNull(screenshot);
      try (var out = instrumentation.getTargetContext().openFileOutput("android-sign-in.png", 0)) {
        screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out);
      }
    }
  }
}
