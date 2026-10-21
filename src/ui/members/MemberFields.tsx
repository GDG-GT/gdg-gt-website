import type { Dispatch, SetStateAction } from "react";
import { Field } from "../primitives";
import { memberCategories } from "../../../shared/members.mjs";
import type { MemberFields as Fields, Capabilities } from "./types";
export default function MemberFields({
  values,
  setValues,
  interests,
  setInterests,
  creating,
  cap,
  team,
  setTeam,
}: {
  values: Fields;
  setValues: Dispatch<SetStateAction<Fields>>;
  interests: string;
  setInterests: (v: string) => void;
  creating: boolean;
  cap?: Capabilities;
  team: string;
  setTeam: (v: string) => void;
}) {
  const input = (
    label: string,
    key: "name" | "email" | "phone" | "year" | "major" | "team_section",
    maxLength: number,
    required = false,
    type = "text",
  ) => (
    <Field key={key} label={label} required={required}>
      <input
        type={type}
        required={required}
        maxLength={maxLength}
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
    </Field>
  );
  return (
    <>
      <div className="gt-form-grid">
        {input("Name", "name", 100, true)}
        {input("Email", "email", 254, true, "email")}
        {creating && (
          <Field label="Owning scope" required>
            <select
              required={!cap?.globalCreate}
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            >
              {cap?.globalCreate ? (
                <option value="">Chapter</option>
              ) : (
                <option value="">Choose a team</option>
              )}
              {cap?.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Community category">
          <select
            value={values.category}
            onChange={(e) =>
              setValues((v) => ({ ...v, category: e.target.value }))
            }
          >
            {memberCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        {input("Phone (optional)", "phone", 50)}
        {input("Academic year (optional)", "year", 50)}
        {input("Major (optional)", "major", 150)}
        {input("Public profile section", "team_section", 100, true)}
      </div>
      <Field label="Interests" hint="One per line; up to 30 unique interests.">
        <textarea
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
        />
      </Field>
      <label className="gt-member-check">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(e) =>
            setValues((v) => ({ ...v, is_active: e.target.checked }))
          }
        />{" "}
        Active community member
      </label>
      <label className="gt-member-check">
        <input
          type="checkbox"
          checked={values.is_core_team}
          onChange={(e) =>
            setValues((v) => ({ ...v, is_core_team: e.target.checked }))
          }
        />{" "}
        Core community team
      </label>
      <p>
        These flags do not create an officer account or grant permissions.
        Profile synchronization is separate and always produces a draft.
        Changing a name, email, display section or active state can unpublish a
        linked profile until review.
      </p>
    </>
  );
}
