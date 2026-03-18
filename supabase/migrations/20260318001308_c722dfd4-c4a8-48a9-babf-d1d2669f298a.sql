alter table user_venue_interactions
  add constraint fk_uvi_venue
  foreign key (venue_id)
  references venues(google_place_id)
  on delete set null;