export interface VenueType {
  id: string;
  display_name: string;
}

export interface VenueCategory {
  id: string;
  display_name: string;
  venue_types: VenueType[];
}

export interface VenueGroup {
  id: string;
  display_name: string;
  categories: { [key: string]: VenueCategory };
}

export const VENUE_HIERARCHY: { [key: string]: VenueGroup } = {
  gc_accommodation_travel: {
    id: 'gc_accommodation_travel',
    display_name: 'Accommodation Travel',
    categories: {
      vc_hotel: {
        id: 'vc_hotel',
        display_name: 'Hotel',
        venue_types: [
          { id: 'vt_hotel', display_name: 'Hotel' },
          { id: 'vt_resort', display_name: 'Resort' },
          { id: 'vt_boutique_hotel', display_name: 'Boutique Hotel' },
          { id: 'vt_hostel', display_name: 'Hostel' },
          { id: 'vt_guesthouse', display_name: 'Guesthouse' },
          { id: 'vt_homestay', display_name: 'Homestay' },
          { id: 'vt_serviced_apartment', display_name: 'Serviced Apartment' },
          { id: 'vt_aparthotel', display_name: 'Aparthotel' },
          { id: 'vt_hotel_pool_daypass', display_name: 'Hotel Pool (Day-pass)' },
          { id: 'vt_tour_operator', display_name: 'Tour Operator' },
          { id: 'vt_camping_ground', display_name: 'Camping Ground' },
          { id: 'vt_glamping', display_name: 'Glamping' },
          { id: 'vt_caravan_park', display_name: 'Caravan Park' },
          { id: 'vt_business_lounge', display_name: 'Business Lounge' },
          { id: 'vt_travel_agency', display_name: 'Travel Agency' },
          { id: 'vt_ticket_office', display_name: 'Ticket Office' },
        ],
      },
    },
  },
  gc_food_drink: {
    id: 'gc_food_drink',
    display_name: 'Food Drink',
    categories: {
      vc_cafe: {
        id: 'vc_cafe',
        display_name: 'Cafe',
        venue_types: [
          { id: 'vt_coffee_shop', display_name: 'Coffee Shop' },
          { id: 'vt_tea_house', display_name: 'Tea House' },
          { id: 'vt_bakery', display_name: 'Bakery' },
          { id: 'vt_dessert_shop', display_name: 'Dessert Shop' },
          { id: 'vt_ice_cream_parlour', display_name: 'Ice Cream Parlour' },
          { id: 'vt_juice_bar', display_name: 'Juice Bar' },
          { id: 'vt_sweet_shop_mithai', display_name: 'Sweet Shop (Mithai)' },
          { id: 'vt_halwai', display_name: 'Halwai' },
          { id: 'vt_bubble_tea', display_name: 'Bubble Tea' },
          { id: 'vt_board_game_cafe', display_name: 'Board Game Cafe' },
        ],
      },
      vc_restaurant: {
        id: 'vc_restaurant',
        display_name: 'Restaurant',
        venue_types: [
          { id: 'vt_restaurant', display_name: 'Restaurant' },
          { id: 'vt_diner', display_name: 'Diner' },
          { id: 'vt_veg_only_restaurant', display_name: 'Veg-only Restaurant' },
          { id: 'vt_dhaba', display_name: 'Dhaba' },
          { id: 'vt_fine_dining', display_name: 'Fine Dining' },
          { id: 'vt_casual_dining', display_name: 'Casual Dining' },
          { id: 'vt_family_restaurant', display_name: 'Family Restaurant' },
          { id: 'vt_steakhouse', display_name: 'Steakhouse' },
          { id: 'vt_seafood_restaurant', display_name: 'Seafood Restaurant' },
          { id: 'vt_barbecue_house', display_name: 'Barbecue House' },
          { id: 'vt_bistro_brasserie', display_name: 'Bistro/Brasserie' },
          { id: 'vt_hotpot_restaurant', display_name: 'Hotpot Restaurant' },
        ],
      },
      vc_bar: {
        id: 'vc_bar',
        display_name: 'Bar',
        venue_types: [
          { id: 'vt_bar', display_name: 'Bar' },
          { id: 'vt_pub', display_name: 'Pub' },
          { id: 'vt_wine_bar', display_name: 'Wine Bar' },
          { id: 'vt_brewpub', display_name: 'Brewpub' },
          { id: 'vt_cocktail_bar', display_name: 'Cocktail Bar' },
          { id: 'vt_shisha_lounge', display_name: 'Shisha Lounge' },
          { id: 'vt_taproom', display_name: 'Taproom' },
        ],
      },
      vc_fast_food: {
        id: 'vc_fast_food',
        display_name: 'Fast Food',
        venue_types: [{ id: 'vt_fast_food', display_name: 'Fast Food' }],
      },
      vc_food_court: {
        id: 'vc_food_court',
        display_name: 'Food Court',
        venue_types: [{ id: 'vt_food_court', display_name: 'Food Court' }],
      },
      vc_street_vendor: {
        id: 'vc_street_vendor',
        display_name: 'Street Vendor (Mobile)',
        venue_types: [
          { id: 'vt_street_food_stall', display_name: 'Street Food Stall' },
          { id: 'vt_food_truck', display_name: 'Food Truck' },
          // ... add all other street vendor types
        ],
      },
    },
  },
  gc_fitness_wellness: {
    id: 'gc_fitness_wellness',
    display_name: 'Fitness Wellness',
    categories: {
      vc_gym: {
        id: 'vc_gym',
        display_name: 'Gym',
        venue_types: [
          { id: 'vt_gym', display_name: 'Gym' },
          { id: 'vt_fitness_studio', display_name: 'Fitness Studio' },
          { id: 'vt_crossfit_box', display_name: 'CrossFit Box' },
          { id: 'vt_boxing_gym', display_name: 'Boxing Gym' },
        ],
      },
      vc_spa: {
        id: 'vc_spa',
        display_name: 'Spa',
        venue_types: [
          { id: 'vt_spa', display_name: 'Spa' },
          { id: 'vt_sauna_house', display_name: 'Sauna House' },
          { id: 'vt_hammam', display_name: 'Hammam' },
          { id: 'vt_massage_center', display_name: 'Massage Center' },
          { id: 'vt_ayurvedic_clinic', display_name: 'Ayurvedic Clinic' },
          { id: 'vt_meditation_center', display_name: 'Meditation Center' },
          { id: 'vt_wellness_center', display_name: 'Wellness Center' },
          { id: 'vt_sound_healing_studio', display_name: 'Sound Healing Studio' },
        ],
      },
      vc_yoga_studio: {
        id: 'vc_yoga_studio',
        display_name: 'Yoga Studio',
        venue_types: [
          { id: 'vt_yoga_studio', display_name: 'Yoga Studio' },
          { id: 'vt_pilates_studio', display_name: 'Pilates Studio' },
          { id: 'vt_martial_arts_dojo', display_name: 'Martial Arts Dojo' },
        ],
      },
    },
  },
  // Add other categories as needed...
};
