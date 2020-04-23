/**
 * Fichier principal
 *
 *
 */
(function (d3) {
    "use strict";
    
    /***** Configuration *****/

    const map_width = 500;
    const map_height = 500;

    var margin_map = {
        top: 50,
        right: 50,
        bottom: 50,
        left: 80
    };

    var barChartMarginV2 = {
        top: 40,
        right: 40,
        bottom: 40,
        left: 60
    };
    var barChartWidthV2 = 500 - barChartMarginV2.left - barChartMarginV2.right;
    var barChartHeightV2 = 350 - barChartMarginV2.top - barChartMarginV2.bottom;

    /***** Échelles utilisées *****/

    var x_map = d3.scaleLinear().range([10, map_width]);
    var y_map = d3.scaleLinear().range([10, map_height]);

    var color_station = d3.scaleLinear().range(["white", "red"]);
    var pipe_scale = d3.scaleLinear().range([2, 40]);

    /***** Chargement des données *****/
    var promises = [];
    promises.push(d3.csv("./data/incidents.csv"));
    promises.push(d3.json("./data/pt_metro.json"));
    promises.push(d3.json("./data/lines.json"));

    // Quand toutes les données sont chargées:
    Promise.all(promises)
        .then(function (results) {
            var incidents = results[0];

            var pt_metro = results[1].sort((a, b) => (parseInt(a.id) > parseInt(b.id)));

            var lines =  results[2];

            /***** Prétraitement des données *****/

            // On nettoie les données
            clean_data(pt_metro, incidents);

            // On attribue à chaque stations les incidents qui la concerne
            var data_stations = data_per_station(pt_metro, incidents);

            var KFS = results[0].filter(row => row.KFS == parseInt(1)); //Incidents pour lesquels le frein d'urgence a été actionné (KFS=1)

            var data_freins = data_per_station(pt_metro,KFS); //Données par station pour les incidents pour lesquels KFS = 1
            var sources_ct = []
            sources_ct[0] = create_SourcesCount(data_freins);
            sources_ct[1] = create_SourcesTime(data_freins);
            var sources = sources_ct[0];

            scale_from_GPS(pt_metro, x_map, y_map);
            scale_incidents(data_stations, color_station, pipe_scale);


            /***** V1 *****/

            // Dimensions du piechart
            var width_v1 = 1000,
	        height_v1 = 400,
            radius_v1 = Math.min(width_v1, height_v1) / 2.5;

            var svg_1 = d3.select("#canvasV1")
                        .append("svg")
                        .attr("width", width_v1)
                        .attr("height", height_v1);

            // Créer l'infobulle qui montre l'heure de chaque rectangle
            var tooltip = d3.select("#canvasV1").append("div")
                                                .attr("display", "none")
                                                .attr("class","toolTip")
                                                .style("font-size", "15px")
                                                .style("text-anchor", "middle")
                                                .append("text");

            // Heures d'ouverture du métro   
            var ouverture = 5;
            var fermeture = 24;

            // Création du piechart que l'utilisateur voit lorsqu'il ouvre l'onglet (sélection par défaut)
            var piechart_dataset = count_incidents(incidents, ouverture, fermeture);
            rush_hours(incidents, svg_1);
            create_rectangles(svg_1);
            create_absolut_display(piechart_dataset, svg_1);
            create_piechart(piechart_dataset, svg_1, radius_v1);

            // Update du piechart selon la sélection de l'utilisateur
            select_rectangles(incidents, svg_1, radius_v1);


            /***** V2 *****/

            // On crée un conteneur pour la carte des stations de métro
            var metro_map = d3.select("#canvasV2 svg")
                .attr("width", map_width + margin_map.left + margin_map.right)
                .attr("height", map_height + margin_map.top + margin_map.bottom)
                .attr("margin", d3.mean(margin_map))
                .attr("pointer-events", "visible");

            // On crée un conteneur pour le panneau d'information
            var panel = d3.select("#panel")
                .style("display", "block");

            // On ajoute un bouton de fermeture
            panel.select("button")
                .on("click", function () {
                    panel.style("display", "none");
            });

            // On crée la carte des stations
            var data_by_lines = create_map(metro_map, data_stations, lines, x_map, y_map, pipe_scale, panel);

            // On intialise les données des stations selectionnées
            var selected_data = Object.keys(lines).map(line => {
                return {name: line, stations:[]}});

            // On définit les échelles nécessaires à l'affichage du bar chart
            var x_hour = d3.scaleBand().range([0,barChartWidthV2]);
            x_hour.domain(d3.range(1, 25));
            var y_hour = d3.scaleLinear().range([barChartHeightV2, 0]);

            // On définit les axes du bar chart
            var xAxis = d3.axisBottom(x_hour).tickFormat( d => (`${d}h`));
            var yAxis = d3.axisLeft(y_hour);

            // On définit un conteneur pour le bar chart
            var day_graph_svg  = panel.select("#day_graph")
                .attr("width", barChartWidthV2 + barChartMarginV2.left + barChartMarginV2.right)
                .attr("height", barChartHeightV2 + barChartMarginV2.top + barChartMarginV2.bottom);
            var day_graph = day_graph_svg.append("g")
                .attr("transform", "translate(" + barChartMarginV2.left + "," + barChartMarginV2.top + ")");

            // On crée le bar-chart
            create_barChart(day_graph, selected_data, x_hour, y_hour, xAxis, yAxis, barChartWidthV2, barChartHeightV2);

            // On ajoute les événements de sélection aux stations
            addSelectionToStations(metro_map, panel, data_stations, data_by_lines, selected_data, x_map, y_map, y_hour, yAxis, barChartHeightV2);

            /***** V3 *****/
            // Définir les marges du graphique
            var margin = {
                top: 0,
                right: 100,
                bottom: 20,
                left: 0
            };

            // Ajouter les boutons de sélection du scénario
            var scenario_panel = d3.select('#canvasV3')
                .append('div')
                .attr('id', 'scenario_panel');

            // Mettre la V3 dans l'élément SVG qui se nomme svg_v3
            var svg_v3 = d3.select('#canvasV3')
                           .append('svg')
                           .attr('width', map_width + margin.left + margin.right)
                           .attr('height', map_height + margin.top + margin.bottom);

            // Ajouter l'élément graphique de la carte dans le svg container
            var metro_map_v3 = svg_v3.append("g");

            // Ajouter l'affichage pour le temps
            var time_panel = d3.select('#canvasV3')
                .append('div')
                .attr('id', 'time_panel')
                .attr('style', 'float: right; visibility: hidden');
    
            // Création de la carte
            create_map_v3(metro_map_v3, map_width, map_height, data_stations, lines, x_map, y_map, scenario_panel, time_panel);


            /***** V4 *****/
            // Mettre la V4 dans l'élément SVG qui se nomme svg_v4

            // Définir les marges du graphique
            var margin_v4 = {
                 top: 25,
                 right: 50,
                 bottom: 50,
                 left: 0
                        };

            /***** Définition des marges *****/
            var barChartMargin = {
                top: 50,
                right: 50,
                bottom: 50,
                left: 50
            };

            var barChartWidth = 550 - barChartMargin.left - barChartMargin.right;
            var barChartHeight = 500 - barChartMargin.top - barChartMargin.bottom;

            
            // svg_v4 est deux fois plus large pour permettre 2 bar chart un à coté de l'autre
            var svg_v4 = d3.select('#canvasV4')
                           .append('svg')
                           .attr("width", 2*(barChartWidth + barChartMargin.left + barChartMargin.right))
                           .attr("height", (barChartHeight + barChartMargin.top + barChartMargin.bottom));
          

            var bar_count = svg_v4.append("g")
                                .attr("transform", "translate(" + margin_v4.left + "," + margin_v4.top + ")")
                                .attr("id", "left_bar_chart");


            var bar_count_causes = svg_v4.append("g")
                                .attr("transform", "translate(" + (margin_v4.left+barChartWidth+barChartMargin.left) + "," + margin_v4.top + ")")
                                .attr("id","right_bar_chart");

            /***Création de l'infobulle***/
            var tip_v4 = d3.tip()
                .attr('class', 'd3-tip-v4')
                .offset([-10, 0]);

            /***** Création du graphique à barres *****/
            create_bar_count(bar_count, sources, tip_v4, barChartHeight, barChartWidth);
            bar_count.append("text")
                .attr("class", "label")
                .attr("text-anchor", "middle")
                .attr("y", barChartHeight+40)
                .attr("x", barChartWidth*0.5)
                .text('Ligne');

            // Fonction que lorsque l'on clique sur une barre à gauche, fait apparaitre le bar chart par cause droite
            display_causes(bar_count_causes, sources, barChartHeight, barChartWidth);


            /***** Transition entre les unités de comparaison d'incidents: nombre et temps *****/
            var textebouton = "Nombre d'arrêts";
            var toggleButtons = d3.selectAll(".toggle-buttons > button");
                toggleButtons.on("click", function(d, i) {

                    textebouton = d3.select(this).text()
                    sources = sources_ct[i];
                toggleButtons.classed("active", function() {
                    return textebouton === d3.select(this).text();
                });
            bar_count_causes.selectAll("*").remove();
            transition_bar_charts(bar_count, sources, tip_v4, barChartHeight, barChartWidth, bar_count_causes);
                });
            
            /***** Création de l'infobulle *****/
            tip_v4.html(function(d) {
                return getToolTipText.call(this, d, sources);
            });
            svg_v4.call(tip_v4);  
  

        });
})(d3);
